import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { ACCESS_POINT_PROVIDER } from '@ncr/domain-core';
import type { MockProvider } from '@ncr/providers';
import { REGISTRO_AUDITORIA } from '../src/comun/auditoria';
import type { AuditoriaEnMemoria } from '../src/comun/auditoria';
import type { ContextoTenant } from '../src/autenticacion';
import type { ResultadoDeSondeo } from '../src/equipos';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { COP_A, COP_B, EQUIPO_DE_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UN EQUIPO DE B, PEDIDO DESDE A · ETAPA 15-L (fuga del Bloque 0.4)
 *
 * La prueba negativa que el cliente pidió antes de cerrar la fuga WHEP, y
 * ampliada a todo lo que recibe un equipo del cliente: con la sesión y la
 * ruta de la copropiedad A y el id de un equipo de B, CADA operación responde
 * 404, no toca el equipo y deja constancia en `auditoria_seguridad`. Y el
 * control positivo: el mismo equipo desde SU copropiedad pasa esa barrera
 * (responde lo que responda la operación, pero no 404).
 *
 * Dos caminos, como el resto del aislamiento: el registro en memoria (siempre)
 * y la tabla `dispositivos` real (con `DATABASE_URL_PRUEBAS`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const MOTIVO = 'Prueba de aislamiento: el equipo es de otra copropiedad';
const PLANTILLA = '80000000-0000-4000-8000-000000000001';
const SDP = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';

/** Cada operación que recibe un equipo, como la pide la consola. */
const operaciones = (cop: string, equipo: string) =>
  [
    ['video en vivo (WHEP)', 'post', `/copropiedades/${cop}/guardia/video/${equipo}/whep`, SDP],
    [
      'apertura manual',
      'post',
      `/copropiedades/${cop}/guardia/ordenes`,
      { dispositivoId: equipo, accion: 'abrir', motivo: MOTIVO },
    ],
    [
      'negación manual',
      'post',
      `/copropiedades/${cop}/guardia/ordenes`,
      { dispositivoId: equipo, accion: 'negar', motivo: MOTIVO },
    ],
    [
      'bloqueo del acceso',
      'post',
      `/copropiedades/${cop}/guardia/bloqueo`,
      { dispositivoId: equipo, bloqueado: true, motivo: MOTIVO },
    ],
    [
      'canal de audio: abrir',
      'post',
      `/copropiedades/${cop}/guardia/intercom/abrir`,
      { dispositivoId: equipo },
    ],
    [
      'canal de audio: cerrar',
      'post',
      `/copropiedades/${cop}/guardia/intercom/cerrar`,
      { dispositivoId: equipo },
    ],
    ['canal de audio: estado', 'get', `/copropiedades/${cop}/guardia/intercom/${equipo}`, null],
    ['audio: escuchar', 'get', `/copropiedades/${cop}/guardia/intercom/${equipo}/audio`, null],
    ['reinicio del equipo', 'post', `/copropiedades/${cop}/dispositivos/${equipo}/reinicio`, {}],
    [
      'plantilla a una terminal',
      'post',
      `/copropiedades/${cop}/biometria/plantillas/${PLANTILLA}/sincronizacion`,
      { dispositivoId: equipo },
    ],
  ] as const;

const pedir = (
  app: INestApplication,
  token: string,
  [, metodo, ruta, cuerpo]: ReturnType<typeof operaciones>[number],
) => {
  const base = request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${token}`);
  if (typeof cuerpo === 'string') return base.set('content-type', 'application/sdp').send(cuerpo);
  return cuerpo === null ? base : base.send(cuerpo);
};

describe('un equipo de B desde A · registro en memoria', () => {
  let app: INestApplication;
  let deA = '';
  let deB = '';

  beforeAll(async () => {
    const firmante = await crearFirmante();
    app = await crearApp(firmante);
    // El simulado CONOCE el equipo de B: sin la barrera, la apertura desde A
    // movería de verdad su puerta, y el oráculo de abajo lo vería.
    const simulado = app.get<MockProvider>(ACCESS_POINT_PROVIDER);
    (simulado as unknown as { dispositivos: Set<string> }).dispositivos.add(EQUIPO_DE_B);
    deA = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    deB = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
  });
  afterAll(async () => {
    await app?.close();
  });

  for (const operacion of operaciones(COP_A, EQUIPO_DE_B)) {
    it(`${operacion[0]}: 404 y constancia en auditoría`, async () => {
      const auditoria = app.get<AuditoriaEnMemoria>(REGISTRO_AUDITORIA);
      const antes = auditoria.registros.length;
      const r = await pedir(app, deA, operacion);
      expect(r.status, JSON.stringify(r.body)).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain(EQUIPO_DE_B);
      const nuevo = auditoria.registros.slice(antes).at(-1);
      expect(nuevo?.copropiedadSolicitada).toBe(COP_A);
      expect(nuevo?.recurso).toContain(EQUIPO_DE_B);
    });
  }

  it('la puerta de B no se movió por ninguna de esas peticiones', () => {
    const mock = app.get<MockProvider>(ACCESS_POINT_PROVIDER);
    expect(mock.aperturas.filter((a) => a.dispositivoId === EQUIPO_DE_B)).toEqual([]);
  });

  for (const operacion of operaciones(COP_B, EQUIPO_DE_B)) {
    it(`control positivo · ${operacion[0]} desde B pasa la barrera del equipo`, async () => {
      const r = await pedir(app, deB, operacion);
      // Lo que responda la operación es asunto suyo (503 sin puente, 409 sin
      // video, 404 de la plantilla que no existe…); lo que NO puede ser es el
      // 404 del equipo ajeno, que se reconoce por su constancia.
      const auditoria = app.get<AuditoriaEnMemoria>(REGISTRO_AUDITORIA);
      expect(auditoria.registros.some((a) => a.copropiedadSolicitada === COP_B)).toBe(false);
      expect(r.status).not.toBe(500);
    });
  }
});

/**
 * La tabla `dispositivos` real: el equipo de B sale de la base, con la RLS
 * forzada y la lectura de servicio del repositorio. Sin base se omite y lo dice.
 */
describe('un equipo de B desde A · tabla dispositivos (PostgreSQL)', () => {
  let pool: Pool | undefined;
  let repo: RepositorioDeEquiposPg | undefined;
  let app: INestApplication | undefined;
  let deA = '';
  let equipoDeB = '';
  let adminDeB = '';
  // H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
  exigirBase(
    'sin DATABASE_URL_PRUEBAS o sin administrador de B en la base',
    () => app !== undefined,
  );

  /**
   * Corrección 2 de la 15-L · el equipo de B lo crea ESTA suite. Antes tomaba
   * «cualquier equipo activo de B» de la base compartida, y el único que había
   * lo creaba `registro-de-equipos-pg` en la misma corrida: cuando esta suite
   * llegaba antes, no había ninguno y la prueba salía por el `return` —un
   * verde que no probaba nada—. El guardián de `--con-base` lo destapó en el
   * paso 14 del verificador (una roja en la primera de tres corridas).
   */
  const CORRIDA = randomBytes(3).toString('hex');
  const comoAdminDeB = (): ContextoTenant => ({
    usuarioId: adminDeB,
    rol: 'administrador',
    copropiedadId: COP_B,
    copropiedadesAtendidas: [],
    mfaVerificado: true,
  });

  beforeAll(async () => {
    if (URL_BASE === undefined || URL_BASE === '') return;
    pool = new Pool({ connectionString: URL_BASE, max: 2 });
    repo = new RepositorioDeEquiposPg(pool, 'llave-de-equipos-solo-para-pruebas-32+', 'env:X');
    const { rows } = await pool
      .query<{ id: string }>(
        `SELECT u.id FROM public.usuarios u JOIN public.roles_usuario r ON r.usuario_id = u.id
          WHERE r.copropiedad_id = $1 AND r.rol = 'administrador' LIMIT 1`,
        [COP_B],
      )
      .catch(() => ({ rows: [] as { id: string }[] }));
    adminDeB = rows[0]?.id ?? '';
    if (adminDeB === '') return;
    const creado = await repo.crear(
      comoAdminDeB(),
      COP_B,
      {
        nombre: `Equipo de B para el aislamiento ${CORRIDA}`,
        tipo: 'intercom',
        host: `203.0.113.${String(1 + (parseInt(CORRIDA, 16) % 200))}`,
        puerto: 1024 + (parseInt(CORRIDA, 16) % 60_000),
        protocolo: 'http',
        usuario: 'servicio',
        secreto: `aislamiento-${CORRIDA}`,
      },
      {
        clase: 'alcanzado',
        detalle: 'responde',
        modelo: 'MODELO-DE-PRUEBA',
        firmware: 'V0',
        latenciaMs: 3,
        verificado: true,
      } as ResultadoDeSondeo,
    );
    equipoDeB = creado.id;
    const firmante = await crearFirmante();
    app = await crearApp(firmante, undefined, undefined, { repositorio: repo });
    deA = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app?.close();
    // Baja lógica, como manda RN-19: ni una prueba borra un equipo.
    if (repo !== undefined && equipoDeB !== '') {
      await repo.desactivar(comoAdminDeB(), COP_B, equipoDeB, 'fin de la prueba de aislamiento');
    }
    await pool?.end();
  });

  it('video, apertura e intercom de un equipo REAL de B, desde A: 404', async () => {
    if (app === undefined) {
      console.log('OMITIDA: sin DATABASE_URL_PRUEBAS o sin administrador de B en la base.');
      return;
    }
    for (const operacion of operaciones(COP_A, equipoDeB).slice(0, 5)) {
      const r = await pedir(app, deA, operacion);
      expect(r.status, `${operacion[0]}: ${JSON.stringify(r.body)}`).toBe(404);
    }
  });
});
