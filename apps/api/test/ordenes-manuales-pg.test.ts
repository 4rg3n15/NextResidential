import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { BitacoraDeOrdenesPg } from '../src/guardia/infraestructura/bitacora-de-ordenes-pg';
import type { OrdenEjecutada } from '../src/guardia/aplicacion/apertura-manual';
import { URL_BASE, exigirBase } from './base-exigida';
import { copropiedadDeLaCorrida } from './copropiedad-propia';
import { interferir, ordenesFuturasEnLaCompartida } from './interferencia';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-139 · LAS ÓRDENES MANUALES SOBREVIVEN A UN REINICIO · antes en
 * `persistencia-operativa-pg`, con la misma forma: escribe una instancia (un
 * `Pool`) y lee OTRA.
 *
 * 15-S5 · DT-15M-C01 · en una copropiedad PROPIA de la corrida. En COP_A, las
 * órdenes con fecha futura que dejan otras suites —y que la tabla no deja
 * borrar— acababan sacando la de esta corrida de «las últimas 20»
 * (interferencia `ordenes-futuras`). Y el `DELETE` que debe fallar sólo falla
 * si HAY filas que borrar —el disparador es por fila—: aquí las hay siempre,
 * las de esta corrida, y no las de quien haya pasado antes por COP_A.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CORRIDA = randomBytes(4).toString('hex');

let escribe: Pool | undefined;
let lee: Pool | undefined;
let cop = '';
let operadorId = '';
let disponible = false;

beforeAll(async () => {
  if (!URL_BASE) return;
  escribe = new Pool({ connectionString: URL_BASE, max: 2 });
  lee = new Pool({ connectionString: URL_BASE, max: 2 });
  const propia = await copropiedadDeLaCorrida(escribe, `Órdenes ${CORRIDA}`);
  cop = propia.id;
  operadorId = propia.ctx.usuarioId;
  disponible = true;
});
afterAll(async () => {
  await escribe?.end();
  await lee?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);
const omitida = (): boolean => !disponible;

describe('órdenes manuales · el rastro de RN-08 sobrevive a un reinicio', () => {
  it('registrar, anotar el desenlace y leer las últimas con otra instancia', async () => {
    if (omitida()) return;
    const orden: OrdenEjecutada = {
      id: randomUUID(),
      copropiedadId: cop,
      accion: 'abrir',
      motivo: `Visitante confirmado por teléfono ${CORRIDA}`,
      operadorId,
      rol: 'portero',
      dispositivoId: randomUUID(),
      momento: new Date(),
      eventoId: null,
    };
    const a = new BitacoraDeOrdenesPg(escribe as Pool);
    await a.registrar(orden);
    await a.anotarResultado(cop, orden.id, 'aceptada', 'relé en 120 ms');

    await interferir('ordenes-futuras', () => ordenesFuturasEnLaCompartida(escribe as Pool, 20));
    const ultimas = await new BitacoraDeOrdenesPg(lee as Pool).ultimas(cop, 20);
    const mia = ultimas.find((o) => o.id === orden.id);
    expect(mia?.motivo).toBe(orden.motivo);
    expect(mia?.resultado).toBe('aceptada');
    expect(mia?.detalle).toBe('relé en 120 ms');
    expect(mia?.rol).toBe('portero');
  });

  it('las órdenes no se borran: DELETE falla por disparador', async () => {
    if (omitida()) return;
    const { rows } = await (lee as Pool).query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.ordenes_manuales WHERE copropiedad_id = $1',
      [cop],
    );
    // Sin filas, un disparador por fila no salta y el DELETE «pasaría» sin probar nada.
    expect(rows[0]?.n).toBeGreaterThan(0);
    const c = await (lee as Pool).connect();
    try {
      await c.query("SELECT set_config('request.jwt.claims', '', false)");
      await expect(
        c.query('DELETE FROM public.ordenes_manuales WHERE copropiedad_id = $1', [cop]),
      ).rejects.toThrow();
    } finally {
      c.release();
    }
  });
});
