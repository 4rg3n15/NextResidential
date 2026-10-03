import type { Pool } from 'pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CONC001, EL VEHÍCULO «SIN DUEÑO», LO PONE QUIEN LO NECESITA
 *
 * La DoD del Edge en sitio (`edge-en-sitio-pg.e2e.test.ts`) cuenta CONC001 entre
 * las placas que abren —«residentes, sin dueño y la visita: 5 de cada 7»— y la
 * paridad nube-Edge (`edge-misma-decision-pg.e2e.test.ts`) lo usa para el camino
 * de la persona sintética. Esa fila NO está en la semilla: la deja la prueba SQL
 * de KPI-03 (`supabase/policies/tests/30_concurrencia_placas.sh`), que el
 * verificador corre en el paso 12, DESPUÉS de la suite del paso 5.
 *
 * Con una base recién sembrada —`supabase/verificar.sh --con-semillas`, la que
 * pide el paso 1c del verificador— la DoD daba 12 aperturas de 15 y la paridad
 * no ejercía la persona sintética. Pasaban en CI, porque el flujo corre antes
 * `--con-pruebas` (con KPI-03), y en una base que venía de corridas anteriores:
 * un verde que dependía de la historia de la base (H-15R-C01). Lo destapó la
 * corrección de la 15-R (DT-15R-09) al verificar sobre una base nueva.
 *
 * Se crea como la crea KPI-03 —vivienda 1 de la semilla, sin persona— y sólo si
 * falta: la restricción de placa activa única (ADR-04) no admite otra.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COPROPIEDAD = '10000000-0000-4000-8000-000000000001';
const VIVIENDA = '30000000-0000-4000-8000-000000000001';
const USUARIO = '00000000-0000-4000-8000-000000000002';

export const conVehiculoSinDueno = async (pool: Pool): Promise<Pool> => {
  await pool.query(
    `INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
     SELECT $1, $2, 'CONC001', $3, $3
      WHERE NOT EXISTS (SELECT 1 FROM public.vehiculos
                         WHERE copropiedad_id = $1 AND placa = 'CONC001' AND estado = 'activo')`,
    [COPROPIEDAD, VIVIENDA, USUARIO],
  );
  return pool;
};
