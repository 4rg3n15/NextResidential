import type { PoolClient } from 'pg';
import type { AmbitoDelResidente } from '@ncr/domain-core';
import type { NuevaAutorizacion } from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E3 · H-15J-01 · LA RECURRENTE DEL RESIDENTE ESCRIBE SU PATRÓN
 *
 * El adaptador insertaba la autorización como `recurrente` y NO escribía sus
 * filas de `patrones_recurrencia`; el disparador diferido
 * `tg_recurrente_con_patron` (0013) la rechazaba al confirmar, y por eso la
 * app la tenía cerrada (H-15I-06). Aquí se escriben, en la MISMA transacción y
 * en UNA sentencia (sin N+1), igual que lo hace la consola
 * (`repositorio-autorizaciones-pg.ts`):
 *
 *  · la franja es hora LOCAL de la copropiedad (COMMENT de la 0006); el
 *    desplazamiento del teléfono no se guarda ni decide nada (H-15I-05);
 *  · el dominio usa 0..6 con domingo = 0 y la base ISO 1..7 con domingo = 7:
 *    la conversión vive en el único punto donde los dos se tocan.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const horaLocal = (minutos: number): string => {
  const acotado = Math.min(minutos, 24 * 60 - 1);
  return `${String(Math.floor(acotado / 60)).padStart(2, '0')}:${String(acotado % 60).padStart(2, '0')}:00`;
};

export const escribirPatron = async (
  c: PoolClient,
  ambito: AmbitoDelResidente,
  autorizacionId: string,
  usuarioId: string,
  patron: NuevaAutorizacion['patron'],
): Promise<void> => {
  if (patron === null) return;
  const diasIso = [...new Set(patron.dias)].map((d) => (d === 0 ? 7 : d));
  await c.query(
    `INSERT INTO public.patrones_recurrencia
       (copropiedad_id, autorizacion_id, dia_semana, hora_inicio, hora_fin,
        creado_por, actualizado_por)
     SELECT $1, $2, d, $4::time, $5::time, $6, $6
       FROM unnest($3::smallint[]) AS d`,
    [
      ambito.copropiedadId,
      autorizacionId,
      diasIso,
      horaLocal(patron.minutoInicio),
      horaLocal(patron.minutoFin),
      usuarioId,
    ],
  );
};
