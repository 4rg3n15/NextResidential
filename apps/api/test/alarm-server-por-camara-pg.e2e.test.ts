import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { sobreDeLectura } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { SecretosDeAlarmServerPg } from '../src/equipos/infraestructura/secretos-de-alarm-server-pg';
import { COP_A, COP_B, crearApp, crearFirmante } from './utilidades';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C6 (ETAPA 15-M) · N CÁMARAS, CADA UNA CON SU SECRETO, SIN TOCAR EL .env
 *
 * Dos cámaras dadas de alta desde el registro —una por copropiedad— reciben
 * cada una un secreto emitido por la API (0045). Publican con él y cada
 * lectura queda atribuida a SU equipo y SU copropiedad. Y el secreto de
 * `ALARM_SERVER_EQUIPOS` sigue valiendo para la cámara declarada a mano: es
 * la que funciona hoy y no se toca.
 *
 * Se salta sin `DATABASE_URL_PRUEBAS`; `--con-base` la exige.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CORRIDA = randomBytes(3).toString('hex');
const PUERTO = 1024 + (parseInt(CORRIDA, 16) % 60_000);
const ADMIN_A = '00000000-0000-4000-8000-000000000010';
const DECLARADA = 'camara-declarada-a-mano';
const SECRETO_DECLARADO = `declarado-${'d'.repeat(40)}`;
const LLAVE = 'llave-de-equipos-solo-para-pruebas-32+';

let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let equipos: RepositorioDeEquiposPg | undefined;
let secretos: SecretosDeAlarmServerPg | undefined;
const camaras: { id: string; copropiedadId: string; secreto: string }[] = [];

const ctxAdmin = (copropiedadId: string, usuarioId: string): ContextoTenant => ({
  usuarioId,
  rol: 'administrador',
  copropiedadId,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

const adminDe = async (p: Pool, copropiedadId: string): Promise<string> => {
  const { rows } = await p.query<{ id: string }>(
    `SELECT u.id FROM public.usuarios u JOIN public.roles_usuario r ON r.usuario_id = u.id
      WHERE r.copropiedad_id = $1 AND r.rol = 'administrador' LIMIT 1`,
    [copropiedadId],
  );
  return rows[0]?.id ?? ADMIN_A;
};

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    equipos = new RepositorioDeEquiposPg(pool, LLAVE, 'env:EQUIPOS_LLAVE');
    secretos = new SecretosDeAlarmServerPg(pool, LLAVE);
    for (const [indice, copropiedadId] of [COP_A, COP_B].entries()) {
      const ctx = ctxAdmin(copropiedadId, await adminDe(pool, copropiedadId));
      const creada = await equipos.crear(
        ctx,
        copropiedadId,
        {
          nombre: `Cámara C6 ${CORRIDA}-${String(indice)}`,
          tipo: 'camara_lpr',
          // El banco publica por el bucle local: el host registrado ES el origen.
          host: '127.0.0.1',
          puerto: PUERTO + indice,
          protocolo: 'http',
          usuario: 'servicio',
          secreto: `clave-${CORRIDA}`,
        },
        {
          clase: 'alcanzado',
          detalle: 'responde',
          modelo: 'M',
          firmware: 'V0',
          latenciaMs: 1,
          verificado: true,
        },
      );
      // Lo que hace el alta desde la consola: emitir el secreto de la cámara.
      const secreto = await secretos.emitir(ctx, copropiedadId, {
        id: creada.id,
        host: creada.host,
      });
      camaras.push({ id: creada.id, copropiedadId, secreto });
    }
  } catch (e) {
    console.warn('alarm-server por cámara: base no preparada, se omite:', e);
    return;
  }
  app = await crearApp(
    await crearFirmante(),
    undefined,
    {
      PROVEEDOR_DE_EQUIPOS: 'simulado',
      CARGADOR_DE_CONTEXTO: 'postgres',
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
      ALARM_SERVER_EQUIPOS: `${COP_A}|${DECLARADA}|${SECRETO_DECLARADO}|127.0.0.1,::1`,
    },
    // El registro REAL: es el que dice de quién es cada cámara que publica.
    { repositorio: equipos },
  );
  disponible = true;
});

afterAll(async () => {
  if (equipos !== undefined) {
    for (const c of camaras) {
      await equipos
        .desactivar(
          ctxAdmin(c.copropiedadId, ADMIN_A),
          c.copropiedadId,
          c.id,
          'fin de la prueba C6',
        )
        .catch(() => undefined);
    }
  }
  await app?.close();
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

/** El evento del equipo, en `eventos` o en `eventos_de_equipo`, con un plazo corto. */
const atribucionDe = async (
  p: Pool,
  dispositivoId: string,
): Promise<{ copropiedad_id: string; dispositivo_id: string } | undefined> => {
  for (let intento = 0; intento < 30; intento += 1) {
    const { rows } = await p.query<{ copropiedad_id: string; dispositivo_id: string }>(
      `SELECT copropiedad_id, dispositivo_id FROM public.eventos WHERE dispositivo_id = $1
       UNION ALL
       SELECT copropiedad_id, dispositivo_id FROM public.eventos_de_equipo WHERE dispositivo_id = $1
       LIMIT 1`,
      [dispositivoId],
    );
    if (rows[0] !== undefined) return rows[0];
    await new Promise((listo) => setTimeout(listo, 100));
  }
  return undefined;
};

const publicar = (secreto: string, placa: string) => {
  const lectura = sobreDeLectura({ placa });
  return request((app as INestApplication).getHttpServer())
    .post(`/alarm-server/${secreto}`)
    .set('content-type', lectura.tipoDeContenido)
    .send(lectura.cuerpo);
};

describe.skipIf(URL_BASE === undefined)('C6 · secretos por cámara contra base real', () => {
  it('los dos secretos emitidos tienen 32+ caracteres y son distintos', () => {
    if (!disponible) throw new Error('la base no está preparada');
    expect(camaras).toHaveLength(2);
    for (const c of camaras) expect(c.secreto.length).toBeGreaterThanOrEqual(32);
    expect(camaras[0]?.secreto).not.toBe(camaras[1]?.secreto);
  });

  it('cada cámara publica con SU secreto y la lectura queda en SU equipo y SU copropiedad', async () => {
    const p = pool as Pool;
    for (const [indice, c] of camaras.entries()) {
      const placa = `C6${CORRIDA.slice(0, 2)}${String(indice)}`.toUpperCase();
      const respuesta = await publicar(c.secreto, placa).expect(200);
      expect(respuesta.body).toEqual({ aceptado: true });
      // La lectura es un intento de acceso (`eventos`); lo que no lo es queda
      // en `eventos_de_equipo`. Se admite cualquiera de los dos, del EQUIPO.
      const atribuida = await atribucionDe(p, c.id);
      expect(atribuida).toEqual({ copropiedad_id: c.copropiedadId, dispositivo_id: c.id });
    }
    // Ninguna lectura de la cámara de B cayó en A ni al revés.
    for (const c of camaras) {
      const { rows } = await p.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM (
           SELECT copropiedad_id FROM public.eventos WHERE dispositivo_id = $1
           UNION ALL
           SELECT copropiedad_id FROM public.eventos_de_equipo WHERE dispositivo_id = $1
         ) x WHERE copropiedad_id <> $2`,
        [c.id, c.copropiedadId],
      );
      expect(rows[0]?.n).toBe('0');
    }
  });

  it('el secreto del .env (ALARM_SERVER_EQUIPOS) sigue valiendo: la cámara de hoy no se toca', async () => {
    const respuesta = await publicar(SECRETO_DECLARADO, `ENV${CORRIDA.slice(0, 3)}`).expect(200);
    expect(respuesta.body).toMatchObject({ aceptado: true });
  });

  it('un secreto que no es de nadie —ni del .env ni de una cámara— es 401', async () => {
    await publicar('z'.repeat(44), 'NAD123').expect(401);
  });

  it('el secreto propio de una cámara DADA DE BAJA deja de acreditar', async () => {
    const c = camaras[1];
    if (c === undefined || equipos === undefined) throw new Error('sin cámara');
    await equipos.desactivar(ctxAdmin(c.copropiedadId, ADMIN_A), c.copropiedadId, c.id, 'baja C6');
    await publicar(c.secreto, 'BAJ123').expect(401);
  });

  it('el secreto propio se puede volver a leer (descifrado) para escribirlo en la cámara, y nunca sale por la ficha', async () => {
    const c = camaras[0];
    if (c === undefined || secretos === undefined || pool === undefined)
      throw new Error('sin cámara');
    const ctx = ctxAdmin(c.copropiedadId, await adminDe(pool, c.copropiedadId));
    await expect(secretos.secretoDe(ctx, c.copropiedadId, c.id)).resolves.toBe(c.secreto);
    // Con los claims de OTRA copropiedad, nada (RN-15).
    await expect(secretos.secretoDe(ctxAdmin(COP_B, ADMIN_A), COP_B, c.id)).resolves.toBeNull();
    // En la base no está en claro.
    const { rows } = await pool.query<{ sobre: Buffer; huella: Buffer }>(
      `SELECT secreto_alarm_server_sobre AS sobre, secreto_alarm_server_huella AS huella
         FROM public.dispositivos WHERE id = $1`,
      [c.id],
    );
    expect(rows[0]?.sobre.toString('utf8')).not.toContain(c.secreto);
    expect(rows[0]?.huella.toString('hex')).not.toContain(c.secreto);
  });
});
