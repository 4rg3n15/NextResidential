import type { Pool } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { OcupantesDeLaVivienda, PlazaDeOcupante } from '../aplicacion/puertos-hogar';
import { Deshacer, comoPlataforma, comoServicio, deshaciendo, violacion } from './con-identidad';

/**
 * PLAZAS DE OCUPANTE CONTRA POSTGRESQL (D6, ADR-025). El número de plazas vivas
 * ES el número de ocupantes. Declararlo lo hace el servicio en nombre del primer
 * residente, una vez; añadir o quitar, el superadministrador (lo exige también
 * `tg_plazas_solo_superadministrador`, 0038).
 */
export class OcupantesDeLaViviendaPg implements OcupantesDeLaVivienda {
  constructor(private readonly pool: Pool) {}

  async plazas(copropiedadId: string, viviendaId: string): Promise<readonly PlazaDeOcupante[]> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        id: string;
        numero: number;
        generacion: number;
        usuario_id: string | null;
        ocupante: string | null;
      }>(
        `SELECT p.id, p.numero, p.generacion, p.usuario_id,
                CASE WHEN p.usuario_id IS NULL THEN NULL
                     ELSE coalesce(per.nombre_completo, u.nombre) END AS ocupante
           FROM public.plazas_de_ocupante p
      LEFT JOIN public.usuarios u   ON u.id = p.usuario_id
      LEFT JOIN public.personas per ON per.id = u.persona_id
          WHERE p.copropiedad_id = $1 AND p.vivienda_id = $2 AND p.estado = 'activo'
          ORDER BY p.numero`,
        [copropiedadId, viviendaId],
      );
      return rows.map((f) => ({
        id: f.id,
        numero: f.numero,
        generacion: f.generacion,
        usuarioId: f.usuario_id,
        ocupante: f.ocupante,
      }));
    });
  }

  async declaracion(copropiedadId: string, viviendaId: string, usuarioId: string) {
    return comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
      const { rows } = await c.query<{ es_primero: boolean; declarada: boolean }>(
        `SELECT primer_residente_id IS NOT DISTINCT FROM $3::uuid AS es_primero,
                declarada_en IS NOT NULL AS declarada
           FROM public.ocupacion_de_viviendas
          WHERE copropiedad_id = $1 AND vivienda_id = $2`,
        [copropiedadId, viviendaId, usuarioId],
      );
      const f = rows[0];
      return { esPrimerResidente: f?.es_primero ?? false, declarada: f?.declarada ?? false };
    });
  }

  async declarar(
    copropiedadId: string,
    viviendaId: string,
    usuarioId: string,
    numero: number,
  ): Promise<boolean> {
    try {
      return await deshaciendo(() =>
        comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
          // Las plazas PRIMERO: el disparador sólo deja crearlas mientras la
          // vivienda no esté declarada. La 1 es de quien declara.
          await c.query(
            `INSERT INTO public.plazas_de_ocupante
               (copropiedad_id, vivienda_id, numero, usuario_id, usada_en, creado_por, actualizado_por)
             SELECT $1, $2, n, CASE WHEN n = 1 THEN $3::uuid END, CASE WHEN n = 1 THEN now() END, $3, $3
               FROM generate_series(1, $4::int) AS n`,
            [copropiedadId, viviendaId, usuarioId, numero],
          );
          const r = await c.query(
            `UPDATE public.ocupacion_de_viviendas SET declarada_en = now(), declarada_por = $3
              WHERE copropiedad_id = $1 AND vivienda_id = $2 AND primer_residente_id = $3
                AND declarada_en IS NULL`,
            [copropiedadId, viviendaId, usuarioId],
          );
          if ((r.rowCount ?? 0) === 0) throw new Deshacer(false);
          return true;
        }),
      );
    } catch (e) {
      // Otra declaración simultánea ganó la plaza 1 (plazas_numero_uk).
      if (violacion(e).codigo === '23505') return false;
      throw e;
    }
  }

  async anadir(
    copropiedadId: string,
    viviendaId: string,
    cantidad: number,
    actorId: string,
  ): Promise<readonly PlazaDeOcupante[] | null> {
    const hecho = await comoPlataforma(this.pool, actorId, async (c) => {
      const { rows } = await c.query<{ existe: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM public.viviendas WHERE id = $2 AND copropiedad_id = $1) AS existe',
        [copropiedadId, viviendaId],
      );
      if (rows[0]?.existe !== true) return false;
      await c.query(
        `INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
         SELECT $1, $2, coalesce((SELECT max(numero) FROM public.plazas_de_ocupante
                                   WHERE vivienda_id = $2 AND estado = 'activo'), 0) + n, $4, $4
           FROM generate_series(1, $3::int) AS n`,
        [copropiedadId, viviendaId, cantidad, actorId],
      );
      // Añadir plazas es también declarar: la vivienda queda con número fijado.
      await c.query(
        `INSERT INTO public.ocupacion_de_viviendas
           (vivienda_id, copropiedad_id, declarada_en, declarada_por, creado_por, actualizado_por)
         VALUES ($2, $1, now(), $3, $3, $3)
         ON CONFLICT (vivienda_id) DO UPDATE
           SET declarada_en = coalesce(public.ocupacion_de_viviendas.declarada_en, now()),
               declarada_por = coalesce(public.ocupacion_de_viviendas.declarada_por, $3)`,
        [copropiedadId, viviendaId, actorId],
      );
      return true;
    });
    return hecho ? this.plazas(copropiedadId, viviendaId) : null;
  }

  async retirar(
    copropiedadId: string,
    viviendaId: string,
    plazaId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean> {
    return comoPlataforma(this.pool, actorId, async (c) => {
      const { rows } = await c.query<{ usuario_id: string | null }>(
        `UPDATE public.plazas_de_ocupante
            SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $4,
                motivo_desactivacion = $5
          WHERE id = $3 AND vivienda_id = $2 AND copropiedad_id = $1 AND estado = 'activo'
          RETURNING usuario_id`,
        [copropiedadId, viviendaId, plazaId, actorId, motivo],
      );
      if (rows[0] === undefined) return false;
      const ocupante = rows[0].usuario_id;
      if (ocupante !== null) {
        // Quitar a una persona de la vivienda es darle de baja el vínculo (RN-19:
        // lógica, con historial), no dejarla dentro con una plaza que ya no existe.
        await c.query(
          `UPDATE public.residentes
              SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $3,
                  motivo_desactivacion = left('ocupante retirado por el superadministrador: ' || $4, 300)
            WHERE vivienda_id = $1 AND estado = 'activo'
              AND persona_id = (SELECT persona_id FROM public.usuarios WHERE id = $2)`,
          [viviendaId, ocupante, actorId, motivo],
        );
      }
      return true;
    });
  }
}
