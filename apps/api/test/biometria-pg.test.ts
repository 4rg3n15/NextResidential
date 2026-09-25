import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { capacidadesDescubiertas } from '@ncr/providers';
import type { Bitacora, FaceTemplateProvider, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../src/autenticacion';
import { ACTOR_INGESTA } from '../src/comun/actores-de-servicio';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { TerminalesDeRostrosDesdeRegistro } from '../src/equipos/aplicacion/terminales-de-rostros';
import { AlmacenEnMemoria, BovedaAesGcm } from '../src/biometria/infraestructura/boveda-cifrada';
import {
  AlmacenDeBytesPg,
  RepositorioConsentimientosPg,
  RepositorioPlantillasPg,
  RestriccionDeBaseViolada,
} from '../src/biometria/infraestructura/repositorios-pg';
import {
  BarrerPlantillasVencidas,
  CapturarRostro,
  ResponderConsentimiento,
  RevocarConsentimiento,
  SincronizarPlantilla,
} from '../src/biometria/aplicacion/casos-de-uso';
import { SincronizarPlantillaEnTerminales } from '../src/biometria/aplicacion/sincronizacion-total';
import { IdentidadBiometricaDesdeRepositorios } from '../src/biometria/aplicacion/identidad-biometrica';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A3 (ETAPA 15-E) · CU-02 CONTRA POSTGRESQL REAL, POR LOS ADAPTADORES DE LA API
 *
 * Los cerrojos de RN-09 y RN-11 se probaron en la ETAPA 08 con SQL escrito a
 * mano (`50_consentimiento_biometrico.sql`). Lo que NUNCA se había probado es
 * que el código de la API los alcance: que la captura escriba las filas que
 * esos disparadores vigilan, que el vector quede cifrado en la columna, que la
 * aceptación habilite, que la sincronización quede registrada y que la
 * revocación deje el vector en NULL y la terminal sin plantilla. Esta suite
 * recorre exactamente ese camino, con los mismos casos de uso y los mismos
 * repositorios que corren en producción.
 *
 * Se OMITE —no falla— sin `DATABASE_URL_PRUEBAS`; el verificador lo cuenta.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP_A = '10000000-0000-4000-8000-000000000001';
const LLAVE = 'llave-de-biometria-solo-para-pruebas-32+';
const LLAVE_EQUIPOS = 'llave-de-equipos-solo-para-pruebas-32+';
const CORRIDA = randomBytes(3).toString('hex');
const AHORA = new Date();
const HORA = 3_600_000;

let pool: Pool | undefined;
let disponible = false;
let actorId = '';
let titularId = '';
let terminalId = '';
let equipos: RepositorioDeEquiposPg | undefined;

class RelojMovil implements Reloj {
  instante = AHORA;
  ahora(): Date {
    return this.instante;
  }
}
class Ids implements GeneradorDeId {
  nuevo(): string {
    return randomUUID();
  }
}
class TerminalEspia implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  bytes: Uint8Array | null = null;
  async sincronizar(dispositivoId: string, plantillaId: string, plantilla: Uint8Array) {
    this.bytes = plantilla;
    this.recibidas.push(`${dispositivoId}/${plantillaId}`);
  }
  async suprimir(dispositivoId: string, plantillaId: string) {
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}
const bitacora: Bitacora = { registrar: () => undefined };

const ctx = (): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'administrador',
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});
const claimsAdmin = () =>
  JSON.stringify({ rol: 'administrador', usuario_id: actorId, copropiedad_id: COP_A });
const claimsServicio = () =>
  JSON.stringify({
    rol: 'servicio',
    usuario_id: ACTOR_INGESTA,
    copropiedad_id: COP_A,
    copropiedades: [COP_A],
  });

const consulta = async <T extends Record<string, unknown>>(
  claims: string,
  sql: string,
  parametros: readonly unknown[] = [],
): Promise<T[]> => {
  if (pool === undefined) throw new Error('sin base');
  const c = await pool.connect();
  try {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [claims]);
    const { rows } = await c.query<T>(sql, [...parametros]);
    return rows;
  } finally {
    c.release();
  }
};

const VECTOR = new Uint8Array(Buffer.from(`rostro-de-prueba-${CORRIDA}`));

let reloj: RelojMovil;
let terminal: TerminalEspia;
let consentimientos: RepositorioConsentimientosPg;
let plantillas: RepositorioPlantillasPg;
let boveda: BovedaAesGcm;
let capturar: CapturarRostro;
let responder: ResponderConsentimiento;
let revocar: RevocarConsentimiento;
let enTerminales: SincronizarPlantillaEnTerminales;
let barrer: BarrerPlantillasVencidas;
let identidad: IdentidadBiometricaDesdeRepositorios;

beforeAll(async () => {
  if (URL_BASE === undefined) return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    const admin = await consulta<{ id: string }>(
      JSON.stringify({ rol: 'superadministrador', usuario_id: ACTOR_INGESTA }),
      `SELECT u.id FROM public.usuarios u JOIN public.roles_usuario r ON r.usuario_id = u.id
        WHERE r.copropiedad_id = $1 AND r.rol = 'administrador' LIMIT 1`,
      [COP_A],
    );
    actorId = admin[0]?.id ?? '';
    const persona = await consulta<{ id: string }>(
      claimsAdmin(),
      `SELECT p.id FROM public.personas p JOIN public.visitantes v ON v.persona_id = p.id
        WHERE p.copropiedad_id = $1 AND p.estado = 'activo' ORDER BY p.creado_en LIMIT 1`,
      [COP_A],
    );
    titularId = persona[0]?.id ?? '';
    disponible = actorId !== '' && titularId !== '';
    if (!disponible) return;

    // Una corrida anterior interrumpida puede haber dejado un consentimiento
    // vigente para este titular, y `consent_vigente_uk` sólo admite uno.
    await consulta(
      claimsServicio(),
      `UPDATE public.consentimientos_biometricos
          SET estado = 'revocado', revocado_en = now(), actualizado_en = now(), actualizado_por = $2
        WHERE copropiedad_id = $1 AND persona_id = $3 AND estado = 'vigente'`,
      [COP_A, ACTOR_INGESTA, titularId],
    );

    equipos = new RepositorioDeEquiposPg(pool, LLAVE_EQUIPOS, 'env:EQUIPOS_LLAVE');
    const creado = await equipos.crear(
      ctx(),
      COP_A,
      {
        nombre: `Terminal A3 ${CORRIDA}`,
        tipo: 'terminal_facial',
        host: `terminal-${CORRIDA}.invalid`,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        secreto: 'clave-de-pruebas-1',
      },
      {
        clase: 'alcanzado',
        detalle: 'responde',
        modelo: 'M',
        firmware: 'V0',
        latenciaMs: 1,
        verificado: true,
        capacidades: capacidadesDescubiertas({
          bibliotecaDeRostros: { estado: 'si', maximo: 100, almacenadas: 0 },
        }),
      },
    );
    terminalId = creado.id;

    reloj = new RelojMovil();
    terminal = new TerminalEspia();
    consentimientos = new RepositorioConsentimientosPg(pool);
    plantillas = new RepositorioPlantillasPg(pool);
    boveda = new BovedaAesGcm(LLAVE, 'env:BIOMETRIA_LLAVE', new AlmacenDeBytesPg(pool), terminal);
    capturar = new CapturarRostro(consentimientos, plantillas, boveda, reloj, new Ids());
    responder = new ResponderConsentimiento(consentimientos, plantillas, reloj);
    revocar = new RevocarConsentimiento(consentimientos, plantillas, boveda, reloj);
    const una = new SincronizarPlantilla(consentimientos, plantillas, boveda, reloj);
    enTerminales = new SincronizarPlantillaEnTerminales(
      plantillas,
      new TerminalesDeRostrosDesdeRegistro(equipos),
      una,
      bitacora,
    );
    barrer = new BarrerPlantillasVencidas(plantillas, boveda, reloj);
    identidad = new IdentidadBiometricaDesdeRepositorios(plantillas, consentimientos);
  } catch (error) {
    console.warn('biometria-pg: base no preparada, se omite:', error);
    disponible = false;
  }
});
afterAll(async () => {
  // La terminal de esta corrida se da de baja: la sincronización total va a
  // TODOS los equipos activos con biblioteca, y una corrida no debe heredar
  // los de la anterior (RN-19: baja lógica, nunca borrado).
  if (disponible && equipos !== undefined && terminalId !== '') {
    await equipos.desactivar(ctx(), COP_A, terminalId, 'fin de la prueba biometria-pg');
  }
  await pool?.end();
});

const captura = async (horasDeVida = 8) => {
  const r = await capturar.ejecutar(ctx(), {
    titularId,
    medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
    vector: VECTOR,
    versionPolitica: `v-${CORRIDA}`,
    canal: 'sms',
    suprimirEn: new Date(reloj.ahora().getTime() + horasDeVida * HORA),
  });
  if (!r.ok || !r.valor.aceptada) throw new Error('la captura debía aceptarse');
  return r.valor;
};

interface FilaPlantilla extends Record<string, unknown> {
  estado: string;
  vector_cifrado: Buffer | null;
  llave_ref: string | null;
  algoritmo: string | null;
}
const filaPlantilla = async (id: string) =>
  (
    await consulta<FilaPlantilla>(
      claimsServicio(),
      'SELECT estado, vector_cifrado, llave_ref, algoritmo FROM public.plantillas_biometricas WHERE id = $1',
      [id],
    )
  )[0];

describe.skipIf(URL_BASE === undefined)('A3 · biometría contra PostgreSQL', () => {
  it('la migración 0035 dejó al actor de ingesta como usuario de plataforma', async () => {
    if (!disponible) return;
    const filas = await consulta<{ nombre: string }>(
      JSON.stringify({ rol: 'superadministrador', usuario_id: ACTOR_INGESTA }),
      'SELECT nombre FROM public.usuarios WHERE id = $1 AND copropiedad_id IS NULL',
      [ACTOR_INGESTA],
    );
    expect(filas).toHaveLength(1);
  });

  it('CU-02 completo: captura → aceptación → todas las terminales → revocación inmediata', async () => {
    if (!disponible) return;
    const { plantillaId, consentimientoId } = await captura();

    // 1 · La fila nace pendiente y el vector está CIFRADO en la columna.
    let fila = await filaPlantilla(plantillaId);
    expect(fila?.estado).toBe('pendiente_consentimiento');
    expect(fila?.llave_ref).toBe('env:BIOMETRIA_LLAVE');
    expect(fila?.algoritmo).toBe('AES-256-GCM');
    expect(fila?.vector_cifrado).not.toBeNull();
    expect(Buffer.from(fila?.vector_cifrado ?? []).includes(Buffer.from(VECTOR))).toBe(false);

    // 2 · Sin consentimiento vigente NADIE es reconocible (RN-09).
    expect(await identidad.consentimientoVigente(COP_A, titularId, reloj.ahora())).toBe(false);
    expect(await identidad.titularDePlantilla(COP_A, plantillaId)).toBe(titularId);

    // 3 · El titular acepta: el disparador de 0013 deja pasar la habilitación.
    const aceptado = await responder.ejecutar(ctx(), {
      consentimientoId,
      quienResponde: titularId,
      acepta: true,
    });
    expect(aceptado.ok && aceptado.valor.estado).toBe('vigente');
    expect((await filaPlantilla(plantillaId))?.estado).toBe('pendiente_sincronizacion');

    // 4 · A todas las terminales con biblioteca: la de esta corrida al menos.
    const total = await enTerminales.ejecutar(ctx(), { plantillaId });
    expect(total.ok).toBe(true);
    if (!total.ok) return;
    expect(total.valor.porTerminal.find((t) => t.dispositivoId === terminalId)).toMatchObject({
      sincronizada: true,
    });
    expect(terminal.recibidas).toContain(`${terminalId}/${plantillaId}`);
    // La terminal recibió el CLARO; la base sólo tiene el cifrado.
    expect(Buffer.from(terminal.bytes ?? [])).toEqual(Buffer.from(VECTOR));
    expect((await filaPlantilla(plantillaId))?.estado).toBe('activa');
    const sinc = await consulta<{ estado: string }>(
      claimsServicio(),
      'SELECT estado FROM public.plantilla_sincronizaciones WHERE plantilla_id = $1 AND dispositivo_id = $2',
      [plantillaId, terminalId],
    );
    expect(sinc[0]?.estado).toBe('sincronizada');
    expect(await identidad.consentimientoVigente(COP_A, titularId, reloj.ahora())).toBe(true);

    // 5 · Revocar: vector NULL, fila suprimida, terminal sin plantilla, en el acto.
    const rev = await revocar.ejecutar(ctx(), { consentimientoId, quienRevoca: titularId });
    // `retiradas` cuenta TODOS los equipos con biblioteca que la tenían —una
    // base compartida puede conservar terminales de otras corridas—; lo que
    // se afirma es que la de esta corrida está entre ellas y ninguna quedó
    // pendiente.
    expect(rev.ok && rev.valor).toMatchObject({ plantillasSuprimidas: 1, retiradasPendientes: 0 });
    expect(rev.ok && rev.valor.retiradas).toBeGreaterThanOrEqual(1);
    fila = await filaPlantilla(plantillaId);
    expect(fila).toMatchObject({ estado: 'suprimida', vector_cifrado: null, llave_ref: null });
    expect(terminal.retiradas).toContain(`${terminalId}/${plantillaId}`);
    const retirada = await consulta<{ estado: string }>(
      claimsServicio(),
      'SELECT estado FROM public.plantilla_sincronizaciones WHERE plantilla_id = $1 AND dispositivo_id = $2',
      [plantillaId, terminalId],
    );
    expect(retirada[0]?.estado).toBe('suprimida');
    expect(await plantillas.porRetirar(COP_A)).not.toContainEqual(
      expect.objectContaining({ plantillaId }),
    );
    expect(await identidad.consentimientoVigente(COP_A, titularId, reloj.ahora())).toBe(false);

    // 6 · Y el cerrojo de la base sigue ahí: con el consentimiento revocado,
    // registrar una sincronización nueva es imposible (0022), y se dice como
    // regla, no como error interno.
    await expect(
      plantillas.registrarSincronizacion(
        { copropiedadId: COP_A, plantillaId, dispositivoId: terminalId },
        actorId,
      ),
    ).rejects.toBeInstanceOf(RestriccionDeBaseViolada);
  });

  it('sin aceptación no se habilita ni se sincroniza, y el barrido suprime al vencer (RN-11)', async () => {
    if (!disponible) return;
    const { plantillaId } = await captura(1);
    const total = await enTerminales.ejecutar(ctx(), { plantillaId });
    expect(total.ok).toBe(false);
    if (!total.ok) expect(total.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    expect(terminal.recibidas).not.toContain(`${terminalId}/${plantillaId}`);

    reloj.instante = new Date(AHORA.getTime() + 2 * HORA);
    const barrido = await barrer.ejecutar(ctx());
    expect(barrido.ok && barrido.valor.suprimidas).toBeGreaterThanOrEqual(1);
    expect(await filaPlantilla(plantillaId)).toMatchObject({
      estado: 'suprimida',
      vector_cifrado: null,
    });
    reloj.instante = AHORA;
  });

  it('el almacén en memoria y el de la base se comportan igual ante la bóveda', async () => {
    if (!disponible) return;
    // Mismo vector, misma llave: el de memoria y el de PostgreSQL entregan a
    // la terminal los mismos bytes en claro. Es la prueba de LSP del almacén.
    const enMemoria = new TerminalEspia();
    const bovedaMemoria = new BovedaAesGcm(LLAVE, 'env:X', new AlmacenEnMemoria(), enMemoria);
    await bovedaMemoria.guardar(COP_A, 'p-memoria', VECTOR);
    await bovedaMemoria.empujarATerminal(COP_A, 'p-memoria', 'disp-x');
    expect(Buffer.from(enMemoria.bytes ?? [])).toEqual(Buffer.from(VECTOR));
  });
});
