import { isIP } from 'node:net';
import type { Pool } from 'pg';
import type {
  CambioDeSesion,
  EstadoDeSesion,
  MotivoDeCierre,
  SesionDePorteria,
} from '../dominio/sesion-de-porteria';
import type { NuevaSesion, RepositorioDeSesiones } from '../aplicacion/puertos';
import { conServicio } from './con-servicio';

interface Fila {
  sesion_id: string;
  copropiedad_id: string;
  portero_id: string;
  turno_id: string;
  estado: EstadoDeSesion;
  codigo_hash: string;
  intentos_fallidos: number;
  iniciada_en: Date;
  patrullaje_desde: Date | null;
  cerrada_en: Date | null;
  motivo_cierre: MotivoDeCierre | null;
  origen_declarado: string | null;
}
const CAMPOS = `sesion_id, copropiedad_id, portero_id, turno_id, estado, codigo_hash, intentos_fallidos,
  iniciada_en, patrullaje_desde, cerrada_en, motivo_cierre, origen_declarado`;
const aSesion = (f: Fila): SesionDePorteria => ({
  sesionId: f.sesion_id,
  copropiedadId: f.copropiedad_id,
  porteroId: f.portero_id,
  turnoId: f.turno_id,
  estado: f.estado,
  codigoHash: f.codigo_hash,
  intentosFallidos: Number(f.intentos_fallidos),
  iniciadaEn: f.iniciada_en,
  patrullajeDesde: f.patrullaje_desde,
  cerradaEn: f.cerrada_en,
  motivoCierre: f.motivo_cierre,
  origenDeclarado: f.origen_declarado,
});

/** Columnas que un cambio puede tocar, y su nombre en la tabla. Nada más se escribe. */
const COLUMNAS: Readonly<Record<keyof CambioDeSesion, string>> = {
  estado: 'estado',
  patrullajeDesde: 'patrullaje_desde',
  intentosFallidos: 'intentos_fallidos',
  cerradaEn: 'cerrada_en',
  motivoCierre: 'motivo_cierre',
  turnoId: 'turno_id',
  codigoHash: 'codigo_hash',
};

/**
 * `sesiones_de_porteria`: la consulta de CADA petición de un portero. Una
 * cerrada no se reabre —lo impide el disparador de la 0037— y aquí además
 * ninguna actualización la toca (`estado <> 'cerrada'` en el `WHERE`).
 */
export class SesionesPg implements RepositorioDeSesiones {
  constructor(private readonly pool: Pool) {}

  async de(copropiedadId: string, sesionId: string): Promise<SesionDePorteria | null> {
    return conServicio(this.pool, copropiedadId, null, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT ${CAMPOS} FROM public.sesiones_de_porteria WHERE copropiedad_id = $1 AND sesion_id = $2`,
        [copropiedadId, sesionId],
      );
      return rows[0] === undefined ? null : aSesion(rows[0]);
    });
  }

  async abrir(n: NuevaSesion): Promise<void> {
    await conServicio(this.pool, n.copropiedadId, n.porteroId, async (c) => {
      await c.query(
        `INSERT INTO public.sesiones_de_porteria
           (sesion_id, copropiedad_id, portero_id, turno_id, estado, codigo_hash, iniciada_en,
            origen_ip, origen_declarado, agente, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, 'activa', $5, $6, $7, $8, $9, $3, $3)`,
        [
          n.sesionId,
          n.copropiedadId,
          n.porteroId,
          n.turnoId,
          n.codigoHash,
          n.iniciadaEn,
          n.origen.ip !== null && isIP(n.origen.ip) !== 0 ? n.origen.ip : null,
          n.origen.declarado?.slice(0, 100) ?? null,
          n.origen.agente?.slice(0, 300) ?? null,
        ],
      );
    });
  }

  async actualizar(
    copropiedadId: string,
    sesionId: string,
    cambio: CambioDeSesion,
    actorId: string,
  ): Promise<SesionDePorteria | null> {
    const pares = (Object.keys(cambio) as (keyof CambioDeSesion)[]).filter(
      (k) => cambio[k] !== undefined,
    );
    if (pares.length === 0) return this.de(copropiedadId, sesionId);
    const asignaciones = pares.map((k, i) => `${COLUMNAS[k]} = $${i + 3}`).join(', ');
    return conServicio(this.pool, copropiedadId, actorId, async (c) => {
      const { rows } = await c.query<Fila>(
        `UPDATE public.sesiones_de_porteria SET ${asignaciones}
          WHERE copropiedad_id = $1 AND sesion_id = $2 AND estado <> 'cerrada'
          RETURNING ${CAMPOS}`,
        [copropiedadId, sesionId, ...pares.map((k) => cambio[k])],
      );
      return rows[0] === undefined ? null : aSesion(rows[0]);
    });
  }

  async registrarIntentoFallido(
    copropiedadId: string,
    sesionId: string,
    actorId: string,
  ): Promise<number | null> {
    return conServicio(this.pool, copropiedadId, actorId, async (c) => {
      const { rows } = await c.query<{ intentos_fallidos: number }>(
        `UPDATE public.sesiones_de_porteria
            SET intentos_fallidos = LEAST(intentos_fallidos + 1, 5)
          WHERE copropiedad_id = $1 AND sesion_id = $2 AND estado = 'patrullaje'
          RETURNING intentos_fallidos`,
        [copropiedadId, sesionId],
      );
      return rows[0] === undefined ? null : Number(rows[0].intentos_fallidos);
    });
  }

  async abiertas(copropiedadId: string, porteroId?: string): Promise<readonly SesionDePorteria[]> {
    return conServicio(this.pool, copropiedadId, null, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT ${CAMPOS} FROM public.sesiones_de_porteria
          WHERE copropiedad_id = $1 AND estado <> 'cerrada' AND ($2::uuid IS NULL OR portero_id = $2)
          ORDER BY iniciada_en DESC LIMIT 500`,
        [copropiedadId, porteroId ?? null],
      );
      return rows.map(aSesion);
    });
  }
}
