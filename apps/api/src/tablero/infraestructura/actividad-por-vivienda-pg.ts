import type { Pool } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  ActividadDeVivienda,
  ActividadPorVivienda,
} from '../aplicacion/actividad-por-vivienda';

/**
 * 15-Z3 · UNA consulta por copropiedad, sin N+1 (§2.4): las 500 viviendas de
 * un conjunto salen en la misma sentencia que sus recuentos.
 *
 * Cómo se lee, de dentro hacia fuera:
 *  · `cop` — la copropiedad activa; sin fila, el resultado es `null` (404).
 *  · `vigentes` — las autorizaciones activas cuya vigencia contiene el instante
 *    recibido (`@>` sobre el `tstzrange`, índice GiST de la 0007). El instante
 *    es un PARÁMETRO: el reloj de la aplicación, no `now()`.
 *  · `ultimo` — por autorización, el último evento permitido de ingreso o
 *    salida, dentro de la vigencia y no posterior al instante. Entra por el
 *    índice `eventos_por_vivienda_idx` (copropiedad, vivienda, ocurrido_en)
 *    porque el evento se une también por `vivienda_id`; y la cota inferior
 *    global sobre `ocurrido_en` deja podar las particiones mensuales.
 *  · `dentro` — por vivienda, visitantes distintos cuyo último paso fue un
 *    ingreso; vehículos, los de ellos con placa en la visita o en el ingreso.
 *  · la proyección final parte de las viviendas activas (LEFT JOIN): la que no
 *    tiene actividad sale con ceros, no desaparece.
 *
 * Los claims de servicio van en la transacción de sólo lectura, como en el
 * resto del tablero: la RLS es la segunda barrera; `exigirAlcance` ya decidió.
 */
const CONSULTA = `
WITH cop AS (
  SELECT id FROM public.copropiedades WHERE id = $1 AND estado = 'activa'
), vigentes AS (
  SELECT a.id, a.vivienda_id, a.visitante_id, a.placa, lower(a.vigencia) AS desde
    FROM public.autorizaciones a
   WHERE a.copropiedad_id = $1
     AND a.estado = 'activa'
     AND a.vigencia @> $2::timestamptz
), ultimo AS (
  SELECT DISTINCT ON (a.id) a.id AS autorizacion_id, e.tipo, e.placa_detectada
    FROM vigentes a
    JOIN public.eventos e
      ON e.copropiedad_id = $1
     AND e.vivienda_id = a.vivienda_id
     AND e.autorizacion_id = a.id
     AND e.ocurrido_en >= a.desde
     AND e.ocurrido_en <= $2::timestamptz
     AND e.ocurrido_en >= (SELECT min(desde) FROM vigentes)
     AND e.resultado = 'permitido'
     AND e.tipo IN ('ingreso', 'salida')
   ORDER BY a.id, e.ocurrido_en DESC
), dentro AS (
  SELECT a.vivienda_id,
         count(DISTINCT a.visitante_id) AS visitantes,
         count(DISTINCT a.visitante_id)
           FILTER (WHERE a.placa IS NOT NULL OR u.placa_detectada IS NOT NULL) AS vehiculos
    FROM ultimo u
    JOIN vigentes a ON a.id = u.autorizacion_id
   WHERE u.tipo = 'ingreso'
   GROUP BY a.vivienda_id
)
SELECT v.id, v.identificador, v.agrupacion,
       COALESCE(d.visitantes, 0)::int AS visitantes,
       COALESCE(d.vehiculos, 0)::int  AS vehiculos
  FROM cop
  LEFT JOIN public.viviendas v ON v.copropiedad_id = cop.id AND v.estado = 'activo'
  LEFT JOIN dentro d ON d.vivienda_id = v.id
 ORDER BY v.agrupacion NULLS LAST, v.identificador`;

interface Fila {
  readonly id: string | null;
  readonly identificador: string | null;
  readonly agrupacion: string | null;
  readonly visitantes: number;
  readonly vehiculos: number;
}

export class ActividadPorViviendaPg implements ActividadPorVivienda {
  constructor(private readonly pool: Pool) {}

  async consultar(
    copropiedadId: string,
    ahora: Date,
  ): Promise<readonly ActividadDeVivienda[] | null> {
    const filas = await conCliente(this.pool, async (cliente) => {
      try {
        await cliente.query('BEGIN READ ONLY');
        await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
          JSON.stringify(claimsDeServicio(copropiedadId)),
        ]);
        const r = await cliente.query<Fila>(CONSULTA, [copropiedadId, ahora]);
        await cliente.query('COMMIT');
        return r.rows;
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
    if (filas.length === 0) return null;
    return filas.flatMap((f) =>
      f.id === null || f.identificador === null
        ? []
        : [
            {
              viviendaId: f.id,
              identificador: f.identificador,
              agrupacion: f.agrupacion,
              vehiculosEnVisita: f.vehiculos,
              visitantesAhora: f.visitantes,
            },
          ],
    );
  }
}
