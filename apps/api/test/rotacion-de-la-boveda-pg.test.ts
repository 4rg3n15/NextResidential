import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { ContextoTenant } from '../src/autenticacion';
import { PROPOSITOS, cifrar, derivarLlave, descifrar } from '../src/comun/cripto/sobre-aes-gcm';
import {
  RepositorioDeEquiposPg,
  leerSobre,
} from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { SecretosDeAlarmServerPg } from '../src/equipos/infraestructura/secretos-de-alarm-server-pg';
import {
  RotacionImposible,
  rotarLlaveDeEquipos,
  validarLlaves,
} from '../src/equipos/infraestructura/rotacion-de-la-boveda-pg';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · F2 · ROTAR `EQUIPOS_LLAVE` DEJA ILEGIBLE LO CIFRADO CON LA ANTERIOR
 *
 * Una copropiedad con una cámara (credencial vigente + la del historial +
 * secreto del Alarm Server) y un equipo cuya clave guarda el Edge (huella).
 * Tras rotar: todo abre con la NUEVA y nada con la ANTERIOR —que es lo que
 * deja inservible un respaldo en cuanto la anterior se destruye—, lo leen los
 * lectores REALES (los de la API), y la constancia no lleva ninguna llave.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SUPER = '00000000-0000-4000-8000-000000000002';
const ANTERIOR = `anterior-${randomBytes(16).toString('hex')}`;
const NUEVA = `nueva-${randomBytes(16).toString('hex')}`;
const TERCERA = `tercera-${randomBytes(16).toString('hex')}`;
const REF = 'vault:equipos-llave/v2';
const SUFIJO = randomBytes(3).toString('hex');
const LLAVES = { anterior: ANTERIOR, nueva: NUEVA, referenciaNueva: REF };

let pool: Pool | undefined;
let rls: Pool | undefined; // como en Supabase: sin BYPASSRLS, por las políticas
let disponible = false;
let cop = '';
let rota = '';
let vieja = ''; // historial de una llave aún más antigua (el H-15B-1 de antes)
let camara = '';
let delEdge = '';
let secretoDeCamara = '';

const ctx = (copropiedadId: string): ContextoTenant => ({
  usuarioId: SUPER,
  rol: 'superadministrador',
  copropiedadId,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});
const SIN_PROBAR = {
  clase: 'alcanzado' as const,
  detalle: 'no se probó',
  modelo: null,
  firmware: null,
  latenciaMs: 0,
  verificado: false,
};
const nuevaCopropiedad = async (p: Pool, nombre: string): Promise<string> => {
  const { rows } = await p.query<{ id: string }>(
    `INSERT INTO public.copropiedades (nombre, nit, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [`${nombre} ${SUFIJO}`, `7${String(Date.now()).slice(-8)}${String(nombre.length)}`, SUPER],
  );
  return rows[0]?.id ?? '';
};
const datos = (nombre: string, secreto: string, host = '192.0.2.41') => ({
  nombre: `${nombre} ${SUFIJO}`,
  tipo: 'camara_lpr' as const,
  host,
  puerto: 80,
  protocolo: 'http' as const,
  usuario: 'servicio',
  secreto,
});
const alta = (
  repo: RepositorioDeEquiposPg,
  c: string,
  nombre: string,
  secreto: string,
  host?: string,
) => repo.crear(ctx(c), c, datos(nombre, secreto, host), SIN_PROBAR);
const filas = async (c: string) =>
  (
    await (pool as Pool).query<{ iv: Buffer; cuerpo: Buffer; etiqueta: Buffer; llave_ref: string }>(
      `SELECT iv, cuerpo, etiqueta, llave_ref FROM public.credenciales_de_equipo
        WHERE copropiedad_id = $1 AND iv IS NOT NULL ORDER BY creado_en`,
      [c],
    )
  ).rows;
const abreCon = (maestra: string, c: string, f: { iv: Buffer; cuerpo: Buffer; etiqueta: Buffer }) =>
  descifrar(derivarLlave(maestra, c, PROPOSITOS.credencialesDeEquipo), f).toString('utf8');

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 3 });
  rls = new Pool({ connectionString: URL_BASE, max: 1 });
  rls.on('connect', (c) => void c.query('SET ROLE authenticated'));
  cop = await nuevaCopropiedad(pool, 'Rotación');
  rota = await nuevaCopropiedad(pool, 'Tercera llave');
  vieja = await nuevaCopropiedad(pool, 'Historial viejo');
  const repo = new RepositorioDeEquiposPg(pool, ANTERIOR, 'env:EQUIPOS_LLAVE');
  camara = (await alta(repo, cop, 'Cámara que rota', 'clave-del-historial')).id;
  // Cambiar la clave desde la consola: la anterior queda INACTIVA, con sus bytes.
  await repo.editar(ctx(cop), cop, camara, datos('Cámara que rota', 'clave-vigente'), SIN_PROBAR);
  secretoDeCamara = await new SecretosDeAlarmServerPg(pool, ANTERIOR).emitir(ctx(cop), cop, {
    id: camara,
    host: '192.0.2.41',
  });
  delEdge = (await alta(repo, cop, 'Equipo del Edge', 'otra-clave', '192.0.2.42')).id;
  await pool.query(`UPDATE public.dispositivos SET huella_de_credencial = $2 WHERE id = $1`, [
    delEdge,
    'cd'.repeat(32),
  ]);
  // Una fila que NO es de la anterior: un dato roto o una tercera llave.
  await alta(new RepositorioDeEquiposPg(pool, TERCERA, 'env:OTRA'), rota, 'Ajena', 'x-clave');
  // Lo que dejaba el procedimiento viejo: clave reescrita con otra maestra; la
  // fila anterior queda INACTIVA bajo una llave que ya no está a mano.
  const antigua = await alta(
    new RepositorioDeEquiposPg(pool, TERCERA, 'env:OTRA'),
    vieja,
    'V',
    'a',
  );
  await repo.editar(ctx(vieja), vieja, antigua.id, datos('V', 'b'), SIN_PROBAR);
  disponible = true;
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await rls?.end();
});

describe('F2 · las llaves se validan antes de tocar una fila', () => {
  it.each([
    [{ ...LLAVES, nueva: ANTERIOR }, /igual a la anterior/],
    [{ ...LLAVES, nueva: 'corta' }, /32 caracteres/],
    [{ ...LLAVES, referenciaNueva: NUEVA }, /referencia/],
  ])('%#: se niega', (llaves, motivo) => {
    expect(() => validarLlaves(llaves)).toThrow(motivo);
  });
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

describe.skipIf(URL_BASE === undefined)('F2 · rotación de la bóveda de equipos (15-R)', () => {
  it('antes: lo de la copropiedad abre con la anterior y no con la nueva', async () => {
    const p = pool as Pool;
    expect(await leerSobre(p, ANTERIOR, cop, camara)).toBe('clave-vigente');
    await expect(leerSobre(p, NUEVA, cop, camara)).rejects.toThrow();
    expect(await filas(cop)).toHaveLength(3);
  });

  it('rota: todo abre con la nueva —también el historial— y nada con la anterior', async () => {
    const p = pool as Pool;
    const informe = await rotarLlaveDeEquipos(rls as Pool, LLAVES, [cop]);
    expect(informe).toEqual({
      copropiedades: 1,
      credenciales: 3,
      secretosDeCamara: 1,
      yaRotados: 0,
      huellasDelEdgeRetiradas: 1,
      historialIlegible: 0,
    });
    const tras = await filas(cop);
    expect(tras.map((f) => abreCon(NUEVA, cop, f)).sort()).toEqual(
      ['clave-del-historial', 'clave-vigente', 'otra-clave'].sort(),
    );
    for (const f of tras) {
      expect(() => abreCon(ANTERIOR, cop, f)).toThrow();
      expect(f.llave_ref).toBe(REF);
    }
    // Los lectores de la API, con la NUEVA: la credencial y la acreditación de la cámara.
    expect(await leerSobre(p, NUEVA, cop, camara)).toBe('clave-vigente');
    const acreditada = await new SecretosDeAlarmServerPg(p, NUEVA).equipoPorSecreto(
      secretoDeCamara,
    );
    expect(acreditada).toMatchObject({ dispositivoId: camara, copropiedadId: cop });
    expect(await new SecretosDeAlarmServerPg(p, ANTERIOR).equipoPorSecreto(secretoDeCamara)).toBe(
      null,
    );
    const { rows } = await p.query<{ huella_de_credencial: string | null }>(
      'SELECT huella_de_credencial FROM public.dispositivos WHERE id = $1',
      [delEdge],
    );
    expect(rows[0]?.huella_de_credencial).toBeNull();
  });

  it('deja constancia con la REFERENCIA; ninguna llave ni secreto en la auditoría', async () => {
    const { rows } = await (pool as Pool).query<{ fila: string }>(
      `SELECT row_to_json(a)::text AS fila FROM public.auditoria_seguridad a
        WHERE copropiedad_id_objetivo = $1 AND recurso = 'equipos/llave-maestra'`,
      [cop],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fila).toContain(REF);
    for (const prohibido of [ANTERIOR, NUEVA, 'clave-vigente', secretoDeCamara]) {
      expect(rows[0]?.fila).not.toContain(prohibido);
    }
  });

  it('repetirla no cambia nada: lo que ya abre con la nueva se cuenta y se salta', async () => {
    const antes = await filas(cop);
    const informe = await rotarLlaveDeEquipos(rls as Pool, LLAVES, [cop]);
    expect(informe).toMatchObject({ credenciales: 0, secretosDeCamara: 0, yaRotados: 4 });
    expect((await filas(cop)).map((f) => f.cuerpo.toString('hex'))).toEqual(
      antes.map((f) => f.cuerpo.toString('hex')),
    );
  });

  it('un sobre de una TERCERA llave la detiene, nombra la fila y no toca nada', async () => {
    const antes = await filas(rota);
    await expect(rotarLlaveDeEquipos(rls as Pool, LLAVES, [rota])).rejects.toThrow(
      RotacionImposible,
    );
    await expect(rotarLlaveDeEquipos(rls as Pool, LLAVES, [rota])).rejects.toThrow(
      /credenciales_de_equipo [0-9a-f-]{36} no abre/,
    );
    expect(await filas(rota)).toEqual(antes);
    const [ajena] = antes;
    expect(ajena && abreCon(TERCERA, rota, ajena)).toBe('x-clave');
  });

  it('la herramienta no expone el valor: el error no contiene ninguna de las llaves', async () => {
    const fallo = await rotarLlaveDeEquipos(rls as Pool, LLAVES, [rota]).catch((e: Error) => e);
    for (const llave of [ANTERIOR, NUEVA, TERCERA, 'x-clave']) {
      expect(String(fallo)).not.toContain(llave);
    }
    // Un sobre nuevo con la NUEVA sí abre: la llave no se «gasta» al rotar.
    const s = cifrar(derivarLlave(NUEVA, cop, PROPOSITOS.credencialesDeEquipo), Buffer.from('z'));
    expect(abreCon(NUEVA, cop, s)).toBe('z');
  });

  it('historial de una llave más antigua: se cuenta y se deja; lo vigente, rotado', async () => {
    const antes = await filas(vieja);
    const informe = await rotarLlaveDeEquipos(rls as Pool, LLAVES, [vieja]);
    expect(informe).toMatchObject({ credenciales: 1, historialIlegible: 1 });
    const [inactiva, vigente] = await filas(vieja);
    expect(inactiva).toEqual(antes[0]); // ni un byte: no hay llave a mano que la abra
    expect(vigente && abreCon(NUEVA, vieja, vigente)).toBe('b');
  });
});
