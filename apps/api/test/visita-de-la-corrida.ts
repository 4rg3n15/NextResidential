import { Pool } from 'pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S5 · DT-15M-C01 · UNA VISITA VIGENTE CON PLACA, DE ESTA CORRIDA
 *
 * La visita `ABC9999` de la semilla vale OCHO horas desde que se siembra. Una
 * base levantada por la mañana la tiene vencida por la tarde, y las pruebas
 * que contaban con ella cambiaban de resultado con la edad de la base: el DoD
 * del Edge abría 12 veces en vez de 15 y la paridad dejaba de cubrir una visita
 * permitida (interferencia `semilla-vieja`). Es D-134 —`cargador-contexto-pg`
 * ya la siembra así—, para todas.
 *
 * La misma forma que la de la semilla: vivienda C-42, su residente y su
 * visitante, vigente desde hace una hora y durante dos más.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const visitaVigenteConPlaca = async (superusuario: Pool, placa: string): Promise<void> => {
  await superusuario.query(
    `INSERT INTO public.autorizaciones
       (copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo, placa, vigencia,
        permite_acceso_vehicular, creado_por, actualizado_por)
     VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042',
             '60000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000042',
             'unica', $1, tstzrange(now() - interval '1 hour', now() + interval '2 hours', '[)'),
             true, '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002')`,
    [placa],
  );
};

/** Un `Pool` de un uso, para quien no tiene uno abierto. */
export const conPool = async (url: string, uso: (p: Pool) => Promise<void>): Promise<void> => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    await uso(p);
  } finally {
    await p.end();
  }
};
