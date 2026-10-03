import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, crearApp, crearFirmante, registroDelBanco, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import type { Configuracion } from '../src/configuracion/esquema';
import { ADMINISTRADOR_DE_FACTORES } from '../src/autenticacion/aplicacion/puertos';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · A3 · LO QUE SE PERDÍA AL REINICIAR LA API, YA NO SE PIERDE
 *
 * Tres estados vivían en memoria y desaparecían con cada despliegue:
 *
 *  · los códigos de recuperación del segundo factor (RN-20, CA-25): quien
 *    perdió el teléfono se quedaba sin salida justo el día que la necesitaba;
 *  · los bloqueos de acceso (D-140): la consola «desbloqueaba» un acceso que el
 *    equipo seguía teniendo bloqueado, y se perdía quién y por qué;
 *  · las operaciones de dispositivo pendientes: la orden atribuida se esfumaba.
 *
 * La prueba es la honesta: una API escribe por HTTP, se CIERRA, y OTRA API
 * —otro módulo, otro `Pool`, ningún objeto compartido— lee por HTTP. Si algo
 * siguiera en memoria, la segunda no lo vería.
 *
 * El equipo es uno PROPIO de la corrida, sembrado en el registro del banco de
 * COP_A: un bloqueo en un equipo compartido cambiaría lo que ven las suites que
 * corren a la vez contra la misma base.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const ADMIN = '00000000-0000-4000-8000-000000000010';
const EQUIPO = randomUUID();
const MOTIVO = 'Mantenimiento de la talanquera, prueba de reinicio 15-R';

const conBase: Partial<Configuracion> = {
  PERSISTENCIA_DE_EVENTOS: 'postgres',
  DATABASE_URL: URL_BASE ?? '',
  DATABASE_POOLER_URL: URL_BASE ?? '',
};

let firmante: Firmante;
let disponible = false;
const retiradas: string[] = [];

/** Una API completa contra la base, con el equipo de la corrida en su registro. */
const levantar = async (): Promise<INestApplication> => {
  const registro = registroDelBanco();
  registro.sembrar(COP_A, {
    id: EQUIPO,
    nombre: `Reinicio ${EQUIPO.slice(0, 8)}`,
    tipo: 'camara_lpr',
  });
  return crearApp(
    firmante,
    // El segundo factor lo retira Supabase Auth: fuera del alcance de la base.
    (b) =>
      b.overrideProvider(ADMINISTRADOR_DE_FACTORES).useValue({
        retirarFactoresVerificados: async (id: string) => {
          retiradas.push(id);
          return 1;
        },
      }),
    conBase,
    { repositorio: registro },
  );
};

const comoAdmin = (aal: 'aal1' | 'aal2' = 'aal2') =>
  tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A, usuarioId: ADMIN, aal });

beforeAll(async () => {
  if (!URL_BASE) return;
  const pool = new Pool({ connectionString: URL_BASE, max: 1 });
  try {
    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.usuarios WHERE id = $1',
      [ADMIN],
    );
    disponible = rows[0]?.n === 1;
  } catch {
    disponible = false;
  } finally {
    await pool.end();
  }
  firmante = await crearFirmante();
});

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS o sin el administrador sembrado', () => disponible);

describe('A3 · códigos MFA, bloqueos y operaciones sobreviven a recrear la API', () => {
  const guardado = { codigo: '', otroCodigo: '' };
  let primera: INestApplication | undefined;
  let segunda: INestApplication | undefined;

  afterAll(async () => {
    await primera?.close();
    await segunda?.close();
  });

  it('la primera API genera códigos, bloquea el acceso y ordena un reinicio', async () => {
    if (!disponible) return;
    primera = await levantar();
    const servidor = primera.getHttpServer();
    const auth = `Bearer ${await comoAdmin()}`;

    const codigos = await request(servidor).post('/auth/mfa/codigos').set('Authorization', auth);
    expect(codigos.status).toBe(201);
    const lista = codigos.body.codigos as string[];
    expect(lista).toHaveLength(10);
    guardado.codigo = lista[0] ?? '';
    guardado.otroCodigo = lista[1] ?? '';

    const bloqueo = await request(servidor)
      .post(`/copropiedades/${COP_A}/guardia/bloqueo`)
      .set('Authorization', auth)
      .send({ dispositivoId: EQUIPO, bloqueado: true, motivo: MOTIVO });
    expect(bloqueo.status).toBe(201);

    const reinicio = await request(servidor)
      .post(`/copropiedades/${COP_A}/dispositivos/${EQUIPO}/reinicio`)
      .set('Authorization', auth);
    expect(reinicio.status).toBe(201);

    await primera.close();
    primera = undefined;
  });

  it('una API NUEVA ve el bloqueo con su dueño, su motivo y su fecha', async () => {
    if (!disponible) return;
    segunda = await levantar();
    const res = await request(segunda.getHttpServer())
      .get(`/copropiedades/${COP_A}/guardia/bloqueo`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);
    expect(res.status).toBe(200);
    const propio = (res.body.bloqueos as Array<Record<string, unknown>>).find(
      (b) => b.dispositivoId === EQUIPO,
    );
    expect(propio).toMatchObject({
      bloqueado: true,
      motivo: MOTIVO,
      operadorId: ADMIN,
      rol: 'administrador',
    });
    expect(typeof propio?.desde).toBe('string');
    // Lo que contestó el equipo también se guardó (`anotarResultado`), no sólo la orden.
    expect(['aceptada', 'rechazada', 'inalcanzable']).toContain(propio?.resultado);
  });

  it('y ve el reinicio pendiente del equipo', async () => {
    if (!disponible) return;
    const res = await request((segunda as INestApplication).getHttpServer())
      .get(`/copropiedades/${COP_A}/dispositivos/pendientes`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.dispositivos).toContain(EQUIPO);
  });

  it('y el código guardado sigue sirviendo, UNA sola vez', async () => {
    if (!disponible) return;
    const servidor = (segunda as INestApplication).getHttpServer();
    const recuperar = async (codigo: string) =>
      request(servidor)
        .post('/auth/mfa/recuperacion')
        .set('Authorization', `Bearer ${await comoAdmin('aal1')}`)
        .send({ codigo });

    const primeraVez = await recuperar(guardado.codigo);
    expect(primeraVez.status).toBe(200);
    expect(primeraVez.body.codigosRestantes).toBe(9);
    expect(retiradas).toContain(ADMIN);

    // El mismo código, otra vez: la BASE ya lo marcó consumido.
    const segundaVez = await recuperar(guardado.codigo);
    expect(segundaVez.status).toBe(401);

    // Y otro del mismo juego sigue vivo: no se consumió el juego entero.
    const otro = await recuperar(guardado.otroCodigo);
    expect(otro.status).toBe(200);
    expect(otro.body.codigosRestantes).toBe(8);
  });
});
