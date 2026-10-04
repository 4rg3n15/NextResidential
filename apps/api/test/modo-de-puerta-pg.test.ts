import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, crearApp, crearFirmante, registroDelBanco, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { RELOJ } from '@ncr/domain-core';
import { MockProvider, PERFIL_IDEAL } from '@ncr/providers';
import { PROVEEDOR_DIRECTO } from '../src/proveedores/proveedores.module';
import { relojFijo } from '../src/eventos/aplicacion/dobles';
import { BarrerReversionesDePuertas } from '../src/guardia/aplicacion/reversion-de-puertas';
import { claimsDeServicio } from '../src/comun/claims-de-servicio';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · C6 · LA REVERSIÓN SOBREVIVE A UN REINICIO DE LA API
 *
 * Una API deja la puerta libre por 1 minuto y se CIERRA. Otra API —otro módulo,
 * otro `Pool`, el reloj dos minutos después— ejecuta el barrido que el trabajo
 * de pg-boss invocaría tras arrancar, y la puerta vuelve a normal: la orden
 * pendiente estaba en la base, no en la memoria de la primera.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const EQUIPO = randomUUID();
const T0 = new Date();
let firmante: Firmante;
let pool: Pool | undefined;
let disponible = false;
const simulados: MockProvider[] = [];

const levantar = async (instante: Date): Promise<INestApplication> => {
  const registro = registroDelBanco();
  registro.sembrar(COP_A, { id: EQUIPO, nombre: `Puerta ${EQUIPO.slice(0, 8)}`, tipo: 'intercom' });
  const simulado = new MockProvider({ perfil: PERFIL_IDEAL, semilla: 1, dispositivos: [EQUIPO] });
  simulados.push(simulado);
  return crearApp(
    firmante,
    (b) =>
      b
        .overrideProvider(RELOJ)
        .useValue(relojFijo(instante))
        .overrideProvider(PROVEEDOR_DIRECTO)
        .useValue(simulado),
    {
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      DATABASE_URL: URL_BASE ?? '',
      DATABASE_POOLER_URL: URL_BASE ?? '',
    },
    { repositorio: registro },
  );
};

const filasDe = async (): Promise<
  readonly { modo: string; origen: string; resultado: string }[]
> => {
  const c = await (pool as Pool).connect();
  try {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(COP_A)),
    ]);
    const { rows } = await c.query<{ modo: string; origen: string; resultado: string }>(
      `SELECT modo, origen, resultado FROM public.ordenes_de_modo_de_puerta
        WHERE copropiedad_id = $1 AND dispositivo_id = $2 ORDER BY secuencia`,
      [COP_A, EQUIPO],
    );
    return rows;
  } finally {
    c.release();
  }
};

beforeAll(async () => {
  if (!URL_BASE) return;
  pool = new Pool({ connectionString: URL_BASE, max: 2 });
  try {
    await pool.query('SELECT 1 FROM public.ordenes_de_modo_de_puerta LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
  }
  firmante = await crearFirmante();
});
afterAll(async () => {
  await pool?.end();
});

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS o sin la 0053', () => disponible);

describe('C3/C6 · la reversión pendiente vive en la base', () => {
  it('la primera API deja la puerta libre por 1 min y se cierra', async () => {
    if (!disponible) return;
    const app = await levantar(T0);
    try {
      const res = await request(app.getHttpServer())
        .post(`/copropiedades/${COP_A}/puertas/modos`)
        .set('Authorization', `Bearer ${await tokenDe(firmante, { rol: 'administrador' })}`)
        .send({
          dispositivoId: EQUIPO,
          numeroDePuerta: 2,
          modo: 'libre',
          motivo: 'Mudanza, prueba de reinicio 15-R',
          minutos: 1,
        })
        .expect(201);
      expect(res.body.resultado).toBe('aceptada');
      expect(simulados[0]?.modosDeSalida.get(`${EQUIPO}:2`)).toBe('libre');
    } finally {
      await app.close();
    }
  });

  it('una API NUEVA, dos minutos después, la revierte con su barrido', async () => {
    if (!disponible) return;
    const app = await levantar(new Date(T0.getTime() + 2 * 60_000));
    try {
      await app.get(BarrerReversionesDePuertas).ejecutar();
      expect(simulados[1]?.modosDeSalida.get(`${EQUIPO}:2`)).toBe('normal');
      expect(await filasDe()).toEqual([
        { modo: 'libre', origen: 'consola', resultado: 'aceptada' },
        { modo: 'normal', origen: 'reversion_automatica', resultado: 'aceptada' },
      ]);
      const vista = await request(app.getHttpServer())
        .get(`/copropiedades/${COP_A}/puertas/modos`)
        .set('Authorization', `Bearer ${await tokenDe(firmante, { rol: 'administrador' })}`)
        .expect(200);
      expect(
        (vista.body.modos as { dispositivoId: string }[]).some((m) => m.dispositivoId === EQUIPO),
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});
