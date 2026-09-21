import { Injectable } from '@nestjs/common';
import type { AmbitoDelResidente } from '@ncr/domain-core';
import { BaseDelResidentePg } from './base-pg';
import type { ZonaParaResidente, ZonasDelResidente } from '../aplicacion/puertos';

/**
 * M-5 · HU-19 · Las zonas comunes del conjunto, con su aforo y su horario.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AQUÍ EL ÁMBITO ES LA COPROPIEDAD, Y ESO NO ES UNA EXCEPCIÓN
 *
 * Las zonas comunes son **comunes**: la piscina no es de una vivienda. Así que
 * esta es la única consulta de la superficie del residente que filtra por
 * `copropiedad_id` y no por vivienda, y el ámbito se recibe igual para que el
 * primer eje siga saliendo de la identidad y no de la ruta.
 *
 * Lo que sí es de la vivienda —qué zonas tiene autorizadas un visitante suyo—
 * no se responde aquí: eso cuelga de la autorización.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CRUCE DE MEDIANOCHE, QUE ES LO QUE SE ROMPE
 *
 * `zona_horarios` guarda una franja que cruza medianoche como **dos filas**
 * (S-09, migración 0007): viernes 22:00–24:00 y sábado 00:00–01:00, la segunda
 * marcada `continua_del_dia_anterior`. Esta consulta trae las dos, y por eso la
 * franja del sábado a la una de la mañana **no** es un horario nuevo del sábado
 * sino la cola del viernes.
 *
 * La consecuencia que el residente nota: a las 00:30 de un sábado la piscina
 * figura ABIERTA —porque la franja del viernes sigue viva— y el contador de
 * aforo **no se ha reiniciado**. Reiniciarlo a medianoche vaciaría el aforo con
 * gente dentro, que es exactamente el fallo que `politica_reinicio_aforo`
 * existe para evitar.
 */
@Injectable()
export class ZonasDelResidentePg extends BaseDelResidentePg implements ZonasDelResidente {
  async zonas(ambito: AmbitoDelResidente, ahora: Date): Promise<readonly ZonaParaResidente[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        nombre: string;
        aforo_maximo: number | null;
        conteo_actual: number | null;
        abierta: boolean;
        requiere_autorizacion: boolean;
        franjas: { desde: string; hasta: string }[] | null;
        abierta_ahora: boolean;
      }>(
        `WITH momento AS (
           SELECT $2::timestamptz AS t,
                  (SELECT zona_horaria FROM public.copropiedades WHERE id = $1) AS tz
         ),
         hoy AS (
           SELECT m.t,
                  (m.t AT TIME ZONE m.tz)::date            AS dia,
                  extract(dow FROM (m.t AT TIME ZONE m.tz))::int AS dow,
                  m.tz
             FROM momento m
         ),
         -- Las franjas de HOY y la cola de AYER: las dos cuentan como «ahora».
         vigentes AS (
           SELECT h.zona_id,
                  ((hoy.dia - (CASE WHEN h.dia_semana = hoy.dow THEN 0 ELSE 1 END))
                    + h.hora_inicio) AT TIME ZONE hoy.tz AS desde,
                  ((hoy.dia - (CASE WHEN h.dia_semana = hoy.dow THEN 0 ELSE 1 END))
                    + h.hora_fin)    AT TIME ZONE hoy.tz AS hasta
             FROM public.zona_horarios h
             CROSS JOIN hoy
            WHERE h.copropiedad_id = $1
              AND (h.dia_semana = hoy.dow
                   OR (h.dia_semana = (hoy.dow + 6) % 7 AND NOT h.continua_del_dia_anterior))
         )
         SELECT z.id,
                z.nombre,
                z.abierta,
                (z.tipo IS NOT NULL) AS requiere_autorizacion,
                a.aforo_maximo,
                a.conteo_actual,
                COALESCE(
                  (SELECT json_agg(json_build_object('desde', v.desde, 'hasta', v.hasta)
                                   ORDER BY v.desde)
                     FROM vigentes v WHERE v.zona_id = z.id), '[]'::json
                )::json AS franjas,
                COALESCE(
                  (SELECT bool_or(m.t >= v.desde AND m.t < v.hasta)
                     FROM vigentes v CROSS JOIN momento m WHERE v.zona_id = z.id), false
                ) AS abierta_ahora
           FROM public.zonas z
           LEFT JOIN public.zona_aforo a
             ON a.zona_id = z.id AND a.copropiedad_id = z.copropiedad_id
          WHERE z.copropiedad_id = $1 AND z.estado = 'activo'
          ORDER BY z.nombre ASC`,
        [ambito.copropiedadId, ahora.toISOString()],
      );

      return rows.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        aforoMaximo: f.aforo_maximo ?? 0,
        ocupacionActual: f.conteo_actual ?? 0,
        // Una zona cerrada a mano por la administración está cerrada aunque su
        // horario diga que no: `z.abierta` manda sobre la franja.
        abiertaAhora: f.abierta && f.abierta_ahora,
        franjasDeHoy: (f.franjas ?? []).map((v) => ({
          desde: new Date(v.desde).toISOString(),
          hasta: new Date(v.hasta).toISOString(),
        })),
        requiereAutorizacion: f.requiere_autorizacion,
      }));
    });
  }
}
