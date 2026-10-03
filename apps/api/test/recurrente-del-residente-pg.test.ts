import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { AutorizacionesDelResidentePg } from '../src/residente/infraestructura/autorizaciones-pg';
import { claimsDeServicio } from '../src/comun/claims-de-servicio';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E3 · H-15J-01 · LA RECURRENTE DEL RESIDENTE, CONTRA LA BASE REAL
 *
 * Antes, el adaptador insertaba `recurrente` sin filas de patrón y el
 * disparador diferido `tg_recurrente_con_patron` (0013) la rechazaba al
 * confirmar. Ahora: la autorización existe, con UNA fila por día (ISO 1..7,
 * domingo = 7) y la franja en hora LOCAL; y la transacción entera es atómica
 * (un patrón que la base rechaza no deja autorización huérfana).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const MIRA = '10000000-0000-4000-8000-000000000001';
const AMBITO = { copropiedadId: MIRA, viviendaId: '30000000-0000-4000-8000-000000000042' };
const CREADA_POR = {
  usuarioId: '00000000-0000-4000-8000-000000000013',
  residenteId: '50000000-0000-4000-8000-000000000042',
};
let pool: Pool | undefined;
let disponible = false;

beforeAll(async () => {
  if (!URL_BASE) return;
  pool = new Pool({ connectionString: URL_BASE, max: 2 });
  try {
    await pool.query('SELECT 1 FROM public.patrones_recurrencia LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await pool?.end();
});

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

const nueva = (patron: { dias: number[]; minutoInicio: number; minutoFin: number }) => ({
  visitante: 'Profesora de piano',
  documento: null,
  desde: new Date(Date.now() + 60_000).toISOString(),
  hasta: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  placa: null,
  permiteAccesoVehicular: false,
  acompanantes: [],
  zonasPermitidas: [],
  observaciones: null,
  patron: { ...patron, desplazamientoUtcMinutos: -300 },
  claveDeIdempotencia: `e3-${randomUUID()}`,
});

const filas = async (autorizacionId: string) => {
  const c = await (pool as Pool).connect();
  try {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(MIRA)),
    ]);
    const a = await c.query<{ tipo: string }>(
      'SELECT tipo::text FROM public.autorizaciones WHERE copropiedad_id = $1 AND id = $2',
      [MIRA, autorizacionId],
    );
    const p = await c.query<{ dia_semana: number; hora_inicio: string; hora_fin: string }>(
      `SELECT dia_semana, hora_inicio::text, hora_fin::text FROM public.patrones_recurrencia
        WHERE copropiedad_id = $1 AND autorizacion_id = $2 ORDER BY dia_semana`,
      [MIRA, autorizacionId],
    );
    return { tipo: a.rows[0]?.tipo, patron: p.rows };
  } finally {
    c.release();
  }
};

describe('E3 · la recurrente del residente se guarda con su patrón', () => {
  it('martes y domingo de 14:00 a 18:00 (hora local): dos filas, domingo = 7', async () => {
    if (!disponible) return;
    const r = await new AutorizacionesDelResidentePg(pool as Pool).crearAutorizacion(
      AMBITO,
      CREADA_POR,
      nueva({ dias: [2, 0, 2], minutoInicio: 840, minutoFin: 1080 }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await filas(r.id)).toEqual({
      tipo: 'recurrente',
      patron: [
        { dia_semana: 2, hora_inicio: '14:00:00', hora_fin: '18:00:00' },
        { dia_semana: 7, hora_inicio: '14:00:00', hora_fin: '18:00:00' },
      ],
    });
  });

  it('una franja que la base rechaza no deja autorización huérfana (atómica)', async () => {
    if (!disponible) return;
    const repo = new AutorizacionesDelResidentePg(pool as Pool);
    const pedido = nueva({ dias: [3], minutoInicio: 600, minutoFin: 600 });
    await expect(repo.crearAutorizacion(AMBITO, CREADA_POR, pedido)).rejects.toThrow();
    const { rows } = await (pool as Pool).query(
      'SELECT 1 FROM public.autorizaciones WHERE clave_idempotencia = $1',
      [pedido.claveDeIdempotencia],
    );
    expect(rows).toHaveLength(0);
  });
});
