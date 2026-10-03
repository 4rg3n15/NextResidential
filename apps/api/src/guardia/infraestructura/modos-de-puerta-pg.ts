import type { Pool, PoolClient } from 'pg';
import type { Rol } from '../../autenticacion';
import type { EstadoDeAccionamiento } from '../aplicacion/apertura-manual';
import type {
  AjustesDePuertas,
  ModoTemporal,
  ModoVigente,
  NuevaOrdenDeModo,
  RegistroDeModosDePuerta,
} from '../aplicacion/modo-de-puerta';
import { DURACION_POR_OMISION_MIN } from '../aplicacion/modo-de-puerta';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';

/**
 * 15-R · P-25 · las órdenes de modo de puerta y la duración máxima, en la base
 * (0053). Con los claims de servicio DE LA COPROPIEDAD: la RLS forzada acota a
 * ella aunque la consulta errara. La pregunta «qué puertas siguen libres o
 * bloqueadas» la contesta una consulta: la última orden no normal de cada
 * puerta, sin una orden normal ACEPTADA posterior; las normales fallidas desde
 * entonces son los reintentos.
 */
interface FilaVigente {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly dispositivo_id: string;
  readonly numero_de_puerta: number;
  readonly modo: ModoTemporal;
  readonly motivo: string;
  readonly operador_id: string;
  readonly operador_nombre: string | null;
  readonly rol: Rol;
  readonly ordenada_en: Date;
  readonly revierte_en: Date;
  readonly resultado: EstadoDeAccionamiento | null;
  readonly fallidas: number;
  readonly ultimo_intento: Date | null;
}

const VIGENTES = `
  WITH ultimas AS (
    SELECT DISTINCT ON (dispositivo_id, numero_de_puerta) *
      FROM public.ordenes_de_modo_de_puerta
     WHERE copropiedad_id = $1 AND modo <> 'normal' AND resultado IS DISTINCT FROM 'rechazada'
     ORDER BY dispositivo_id, numero_de_puerta, secuencia DESC)
  SELECT u.id, u.copropiedad_id, u.dispositivo_id, u.numero_de_puerta, u.modo, u.motivo,
         u.operador_id, o.nombre AS operador_nombre, u.rol, u.ordenada_en, u.revierte_en,
         u.resultado, count(n.id)::int AS fallidas, max(n.ordenada_en) AS ultimo_intento
    FROM ultimas u
    LEFT JOIN public.usuarios o ON o.id = u.operador_id
    LEFT JOIN public.ordenes_de_modo_de_puerta n
      ON n.copropiedad_id = u.copropiedad_id AND n.dispositivo_id = u.dispositivo_id
     AND n.numero_de_puerta = u.numero_de_puerta AND n.modo = 'normal'
     AND n.secuencia > u.secuencia
   GROUP BY u.id, u.copropiedad_id, u.dispositivo_id, u.numero_de_puerta, u.modo, u.motivo,
            u.operador_id, o.nombre, u.rol, u.ordenada_en, u.revierte_en, u.resultado
  HAVING bool_and(n.resultado IS DISTINCT FROM 'aceptada')
   ORDER BY u.revierte_en`;

const aVigente = (f: FilaVigente): ModoVigente => ({
  id: f.id,
  copropiedadId: f.copropiedad_id,
  dispositivoId: f.dispositivo_id,
  numeroDePuerta: f.numero_de_puerta,
  modo: f.modo,
  motivo: f.motivo,
  operadorId: f.operador_id,
  operadorNombre: f.operador_nombre,
  rol: f.rol,
  ordenadaEn: f.ordenada_en,
  revierteEn: f.revierte_en,
  resultado: f.resultado,
  reversionesFallidas: f.fallidas,
  ultimoIntento: f.ultimo_intento,
});

const conClaims = <T>(
  pool: Pool,
  claims: Record<string, unknown>,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> =>
  conCliente(pool, async (c) => {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    return await fn(c);
  });

export class RegistroDeModosDePuertaPg implements RegistroDeModosDePuerta {
  constructor(private readonly pool: Pool) {}

  async registrar(o: NuevaOrdenDeModo): Promise<string> {
    return conClaims(this.pool, claimsDeServicio(o.copropiedadId), async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO public.ordenes_de_modo_de_puerta
           (copropiedad_id, dispositivo_id, numero_de_puerta, modo, origen, motivo, operador_id,
            rol, ordenada_en, revierte_en, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $7, $7) RETURNING id`,
        [
          o.copropiedadId,
          o.dispositivoId,
          o.numeroDePuerta,
          o.modo,
          o.origen,
          o.motivo,
          o.operadorId,
          o.rol,
          o.ordenadaEn,
          o.revierteEn,
        ],
      );
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('no se pudo registrar la orden de modo de puerta');
      return id;
    });
  }

  async anotarResultado(
    copropiedadId: string,
    id: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void> {
    await conClaims(this.pool, claimsDeServicio(copropiedadId), (c) =>
      c.query(
        `UPDATE public.ordenes_de_modo_de_puerta SET resultado = $3, detalle = $4
          WHERE copropiedad_id = $1 AND id = $2 AND resultado IS NULL`,
        [copropiedadId, id, resultado, detalle?.slice(0, 500) ?? null],
      ),
    );
  }

  async vigentes(copropiedadId: string): Promise<readonly ModoVigente[]> {
    return conClaims(this.pool, claimsDeServicio(copropiedadId), async (c) => {
      const { rows } = await c.query<FilaVigente>(VIGENTES, [copropiedadId]);
      return rows.map(aVigente);
    });
  }

  /** De TODAS las copropiedades: con los claims del superadministrador del sistema. */
  async copropiedadesConVigentes(): Promise<readonly string[]> {
    const claims = { rol: 'superadministrador', usuario_id: ACTOR_INGESTA, copropiedad_id: null };
    return conClaims(this.pool, claims, async (c) => {
      const { rows } = await c.query<{ copropiedad_id: string }>(
        `SELECT DISTINCT copropiedad_id FROM public.ordenes_de_modo_de_puerta
          WHERE modo <> 'normal' AND ordenada_en > now() - interval '30 days'`,
      );
      return rows.map((r) => r.copropiedad_id);
    });
  }
}

export class AjustesDePuertasPg implements AjustesDePuertas {
  constructor(private readonly pool: Pool) {}

  async duracionMaxima(copropiedadId: string): Promise<number> {
    return conClaims(this.pool, claimsDeServicio(copropiedadId), async (c) => {
      const { rows } = await c.query<{ minutos: number }>(
        `SELECT duracion_maxima_minutos AS minutos FROM public.ajustes_de_puertas
          WHERE copropiedad_id = $1`,
        [copropiedadId],
      );
      return rows[0]?.minutos ?? DURACION_POR_OMISION_MIN;
    });
  }

  async fijarDuracionMaxima(
    copropiedadId: string,
    minutos: number,
    actorId: string,
  ): Promise<void> {
    await conClaims(this.pool, claimsDeServicio(copropiedadId), (c) =>
      c.query(
        `INSERT INTO public.ajustes_de_puertas
           (copropiedad_id, duracion_maxima_minutos, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (copropiedad_id) DO UPDATE
           SET duracion_maxima_minutos = EXCLUDED.duracion_maxima_minutos,
               actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
        [copropiedadId, minutos, actorId],
      ),
    );
  }
}
