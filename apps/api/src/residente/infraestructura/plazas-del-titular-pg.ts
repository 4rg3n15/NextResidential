import type { Pool } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type {
  CupoDePlazas,
  PlazaAnadida,
  PlazaRetiradaPorElTitular,
  PlazasDelTitular,
  TopeCambiado,
} from '../aplicacion/puertos-de-plazas';
import { comoPlataforma, comoServicio, violacion } from './con-identidad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS PLAZAS DEL TITULAR CONTRA POSTGRESQL · RONDA 15-W (D-W10, D4 bis)
 *
 * El titular escribe como SERVICIO de su copropiedad, con él como actor: así lo
 * reconoce `tg_plazas_solo_superadministrador` (0056), que le deja añadir y
 * retirar plazas libres —nunca la 1— y a nadie más de la vivienda. El tope lo
 * decide `tg_tope_de_plazas` bajo un bloqueo por vivienda: dos altas
 * simultáneas sobre la última plaza no pasan las dos, y aquí sólo se traduce su
 * `plazas_tope` a «tope alcanzado». El cambio de tope es de plataforma.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class PlazasDelTitularPg implements PlazasDelTitular {
  constructor(private readonly pool: Pool) {}

  async cupo(copropiedadId: string, viviendaId: string, usuarioId: string): Promise<CupoDePlazas> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        activas: number;
        tope: number;
        es_titular: boolean;
        propio: boolean;
      }>(
        `SELECT (SELECT count(*)::int FROM public.plazas_de_ocupante p
                  WHERE p.vivienda_id = v.id AND p.estado = 'activo') AS activas,
                coalesce(v.tope_de_plazas, c.tope_de_plazas_por_vivienda)::int AS tope,
                EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                         WHERE o.vivienda_id = v.id AND o.primer_residente_id = $3) AS es_titular,
                v.tope_de_plazas IS NOT NULL AS propio
           FROM public.viviendas v JOIN public.copropiedades c ON c.id = v.copropiedad_id
          WHERE v.id = $2 AND v.copropiedad_id = $1`,
        [copropiedadId, viviendaId, usuarioId],
      );
      const f = rows[0];
      return {
        activas: f?.activas ?? 0,
        tope: f?.tope ?? 0,
        esTitular: f?.es_titular ?? false,
        topePropio: f?.propio ?? false,
      };
    });
  }

  /**
   * Dos altas a la vez calculan el MISMO número siguiente; el tope las ordena y,
   * si la segunda aún cabe, choca con `plazas_numero_uk`: se reintenta UNA vez
   * con el número ya recalculado. El tope sí es definitivo.
   */
  async anadir(
    copropiedadId: string,
    viviendaId: string,
    usuarioId: string,
  ): Promise<PlazaAnadida> {
    const primera = await this.intentarAnadir(copropiedadId, viviendaId, usuarioId);
    return primera === 'NUMERO_TOMADO'
      ? (await this.intentarAnadir(copropiedadId, viviendaId, usuarioId)) === 'ANADIDA'
        ? 'ANADIDA'
        : 'TOPE_ALCANZADO'
      : primera;
  }

  private async intentarAnadir(
    copropiedadId: string,
    viviendaId: string,
    usuarioId: string,
  ): Promise<PlazaAnadida | 'NUMERO_TOMADO'> {
    try {
      return await comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
        await c.query(
          `INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
           SELECT $1, $2, coalesce((SELECT max(numero) FROM public.plazas_de_ocupante
                                     WHERE vivienda_id = $2 AND estado = 'activo'), 0) + 1, $3, $3`,
          [copropiedadId, viviendaId, usuarioId],
        );
        return 'ANADIDA' as const;
      });
    } catch (e) {
      const { codigo, restriccion } = violacion(e);
      if (codigo === '23514' && restriccion === 'plazas_tope') return 'TOPE_ALCANZADO';
      if (codigo === '23505' && restriccion === 'plazas_numero_uk') return 'NUMERO_TOMADO';
      throw e;
    }
  }

  async retirar(
    copropiedadId: string,
    viviendaId: string,
    plazaId: string,
    motivo: string,
    usuarioId: string,
  ): Promise<PlazaRetiradaPorElTitular> {
    return comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
      const { rows } = await c.query<{ numero: number; ocupada: boolean }>(
        `SELECT numero, (usuario_id IS NOT NULL OR persona_id IS NOT NULL) AS ocupada
           FROM public.plazas_de_ocupante
          WHERE id = $3 AND vivienda_id = $2 AND copropiedad_id = $1 AND estado = 'activo'
          FOR UPDATE`,
        [copropiedadId, viviendaId, plazaId],
      );
      const plaza = rows[0];
      if (plaza === undefined) return 'NO_ENCONTRADA';
      if (plaza.numero === 1) return 'ES_LA_DEL_TITULAR';
      if (plaza.ocupada) return 'OCUPADA';
      await c.query(
        `UPDATE public.plazas_de_ocupante
            SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $4,
                motivo_desactivacion = left($5, 300)
          WHERE id = $3 AND vivienda_id = $2 AND copropiedad_id = $1 AND estado = 'activo'
            AND usuario_id IS NULL AND persona_id IS NULL`,
        [copropiedadId, viviendaId, plazaId, usuarioId, motivo],
      );
      return 'RETIRADA';
    });
  }

  async cambiarTope(
    copropiedadId: string,
    viviendaId: string,
    tope: number | null,
    actorId: string,
  ): Promise<TopeCambiado> {
    try {
      return await comoPlataforma(this.pool, actorId, async (c) => {
        const r = await c.query(
          `UPDATE public.viviendas SET tope_de_plazas = $3 WHERE id = $2 AND copropiedad_id = $1`,
          [copropiedadId, viviendaId, tope],
        );
        return (r.rowCount ?? 0) === 0 ? 'NO_ENCONTRADA' : 'CAMBIADO';
      });
    } catch (e) {
      const { codigo, restriccion } = violacion(e);
      if (codigo === '23514' && restriccion === 'viviendas_tope_bajo_las_plazas') {
        return 'BAJO_LAS_PLAZAS';
      }
      throw e;
    }
  }
}
