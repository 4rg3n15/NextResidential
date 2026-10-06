import type { Pool, PoolClient } from 'pg';
import type { EjecutorDelAlta, EscrituraDelVinculo } from '../../cuentas';
import type {
  AsignacionDeVivienda,
  TitularidadDeViviendas,
  ViviendaParaTitular,
  ViviendaSinTitular,
} from '../aplicacion/puertos-de-titularidad';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { comoPlataforma, comoServicio } from './con-identidad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL TITULAR DE CADA VIVIENDA, CONTRA POSTGRESQL · RONDA 15-W (D1)
 *
 * La titularidad se escribe SIEMPRE bajo el bloqueo de la vivienda
 * (`ncr:vinculacion:<vivienda>`, el mismo del alta y del cambio de vivienda) y
 * con un INSERT condicionado a que la vivienda siga sin titular: dos altas
 * simultáneas para la misma vivienda no salen las dos (ADR-04). La comprobación
 * previa del caso de uso sólo sirve para responder 404 o 409 antes de crear
 * nada en el proveedor de identidad.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SQL_CON_TITULAR = `
  (EXISTS (SELECT 1 FROM public.residentes r
             JOIN public.usuarios u ON u.persona_id = r.persona_id AND u.estado = 'activo'
            WHERE r.vivienda_id = v.id AND r.estado = 'activo')
   OR EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                JOIN public.usuarios u ON u.id = o.primer_residente_id AND u.estado = 'activo'
               WHERE o.vivienda_id = v.id)
   OR EXISTS (SELECT 1 FROM public.plazas_de_ocupante p
                JOIN public.usuarios u ON u.id = p.usuario_id AND u.estado = 'activo'
               WHERE p.vivienda_id = v.id AND p.estado = 'activo'))`;

const SQL_BLOQUEO = `SELECT pg_advisory_xact_lock(hashtextextended('ncr:vinculacion:' || $1, 0))`;

/** $1 vivienda · $2 copropiedad · $3 cuenta · $4 actor. 1 fila = titular asignado. */
const SQL_TITULAR = `
  INSERT INTO public.ocupacion_de_viviendas
    (vivienda_id, copropiedad_id, primer_residente_id, creado_por, actualizado_por)
  SELECT v.id, v.copropiedad_id, $3, $4, $4 FROM public.viviendas v
   WHERE v.id = $1 AND v.copropiedad_id = $2 AND v.estado = 'activo' AND NOT ${SQL_CON_TITULAR}
  ON CONFLICT (vivienda_id) DO UPDATE SET primer_residente_id = EXCLUDED.primer_residente_id`;

const SQL_RASTRO = `
  INSERT INTO public.bitacora_de_residentes
    (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, detalle, creado_por)
  VALUES ($1, now(), $2, $3, $4, $5, $6, $4)`;

const escribirTitular = async (
  ejecutar: EjecutorDelAlta,
  copropiedadId: string,
  viviendaId: string,
  usuarioId: string,
  actorId: string,
  rastro: { readonly tipo: string; readonly detalle: string | null },
): Promise<boolean> => {
  await ejecutar(SQL_BLOQUEO, [viviendaId]);
  if ((await ejecutar(SQL_TITULAR, [viviendaId, copropiedadId, usuarioId, actorId])) !== 1) {
    return false;
  }
  await ejecutar(SQL_RASTRO, [
    copropiedadId,
    rastro.tipo,
    usuarioId,
    actorId,
    viviendaId,
    rastro.detalle,
  ]);
  return true;
};

const deCliente =
  (c: PoolClient): EjecutorDelAlta =>
  async (sql, parametros) =>
    (await c.query(sql, [...parametros])).rowCount ?? 0;

export class TitularidadDeViviendasPg implements TitularidadDeViviendas {
  constructor(private readonly pool: Pool) {}

  async viviendaParaTitular(
    copropiedadId: string,
    viviendaId: string,
  ): Promise<ViviendaParaTitular> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ activa: boolean; con_titular: boolean }>(
        `SELECT v.estado = 'activo' AS activa, ${SQL_CON_TITULAR} AS con_titular
           FROM public.viviendas v WHERE v.id = $1 AND v.copropiedad_id = $2`,
        [viviendaId, copropiedadId],
      );
      const f = rows[0];
      if (f === undefined) return 'INEXISTENTE';
      if (!f.activa) return 'INACTIVA';
      return f.con_titular ? 'CON_TITULAR' : 'LIBRE';
    });
  }

  escrituraDelTitular(
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
  ): EscrituraDelVinculo {
    return {
      escribir: (ejecutar, usuarioId) =>
        escribirTitular(ejecutar, copropiedadId, viviendaId, usuarioId, actorId, {
          tipo: 'titular_asignado_por_administracion',
          detalle: null,
        }),
    };
  }

  async asignarVivienda(
    copropiedadId: string,
    usuarioId: string,
    viviendaId: string,
    motivo: string,
    actorId: string,
  ): Promise<AsignacionDeVivienda> {
    return comoPlataforma(this.pool, actorId, async (c) => {
      await c.query(SQL_BLOQUEO, [viviendaId]);
      const { rows: cuenta } = await c.query<{ con_vivienda: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM public.residentes r
                         WHERE r.persona_id = u.persona_id AND r.estado = 'activo'
                           AND r.copropiedad_id = u.copropiedad_id)
             OR EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                         WHERE o.primer_residente_id = u.id)
             OR EXISTS (SELECT 1 FROM public.plazas_de_ocupante p
                         WHERE p.usuario_id = u.id AND p.estado = 'activo') AS con_vivienda
           FROM public.usuarios u
          WHERE u.id = $1 AND u.copropiedad_id = $2 AND u.estado = 'activo'
            AND EXISTS (SELECT 1 FROM public.roles_usuario ru
                         WHERE ru.usuario_id = u.id AND ru.rol = 'residente'
                           AND ru.copropiedad_id = $2 AND ru.estado = 'activo')`,
        [usuarioId, copropiedadId],
      );
      if (cuenta[0] === undefined) return 'CUENTA_INEXISTENTE';
      if (cuenta[0].con_vivienda) return 'CUENTA_CON_VIVIENDA';
      const { rows: vivienda } = await c.query<{ activa: boolean; con_titular: boolean }>(
        `SELECT v.estado = 'activo' AS activa, ${SQL_CON_TITULAR} AS con_titular
           FROM public.viviendas v WHERE v.id = $1 AND v.copropiedad_id = $2`,
        [viviendaId, copropiedadId],
      );
      if (vivienda[0] === undefined) return 'VIVIENDA_INEXISTENTE';
      if (!vivienda[0].activa) return 'VIVIENDA_INACTIVA';
      if (vivienda[0].con_titular) return 'CON_TITULAR';
      const hecho = await escribirTitular(
        deCliente(c),
        copropiedadId,
        viviendaId,
        usuarioId,
        actorId,
        {
          tipo: 'vivienda_asignada_por_administracion',
          detalle: motivo.slice(0, 500),
        },
      );
      return hecho ? 'ASIGNADA' : 'CON_TITULAR';
    });
  }

  async viviendasSinTitular(
    copropiedadId: string,
    busqueda: string | null,
  ): Promise<readonly ViviendaSinTitular[]> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      // `position` y no LIKE: un `%` tecleado no es un comodín.
      const { rows } = await c.query<ViviendaSinTitular>(
        `SELECT v.id, v.identificador, v.agrupacion FROM public.viviendas v
          WHERE v.copropiedad_id = $1 AND v.estado = 'activo' AND NOT ${SQL_CON_TITULAR}
            AND ($2::text IS NULL
                 OR position(lower($2) IN lower(v.identificador)) > 0
                 OR position(lower($2) IN lower(coalesce(v.agrupacion, ''))) > 0)
          ORDER BY v.agrupacion NULLS FIRST, v.identificador
          LIMIT 50`,
        [copropiedadId, busqueda === null || busqueda.trim() === '' ? null : busqueda.trim()],
      );
      return rows;
    });
  }
}
