import { isIP } from 'node:net';
import type { Pool } from 'pg';
import { claimsDeServicio } from '../claims-de-servicio';
import type {
  BitacoraDeIdentidad,
  ConsultaDeHechos,
  HechoDeIdentidad,
  HechoRegistrado,
  TipoDeHecho,
} from './puerto';

interface Fila {
  id: string;
  tipo: TipoDeHecho;
  copropiedad_id: string;
  ocurrido_en: Date;
  usuario_id: string | null;
  actor_id: string | null;
  sesion_id: string | null;
  turno_id: string | null;
  duracion_segundos: number | null;
  origen_ip: string | null;
  origen_declarado: string | null;
  agente: string | null;
  detalle: string | null;
}

const recortar = (v: string | null | undefined, max: number): string | null =>
  v === null || v === undefined ? null : v.slice(0, max);

/**
 * `bitacora_de_porteria` en PostgreSQL. Escribe y lee con los claims de
 * SERVICIO de la copropiedad del hecho: la política de inserción los admite y
 * la RLS sigue exigiendo que la fila sea de esa copropiedad. Nunca edita:
 * la tabla no lo permite ni al dueño (ADR-005), y aquí no hay ni el intento.
 */
export class BitacoraDeIdentidadPg implements BitacoraDeIdentidad {
  constructor(private readonly pool: Pool) {}

  async anotar(h: HechoDeIdentidad): Promise<void> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claimsDeServicio(h.copropiedadId)),
      ]);
      const ip = h.origen?.ip ?? null;
      await cliente.query(
        `INSERT INTO public.bitacora_de_porteria
           (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, sesion_id, turno_id,
            duracion_segundos, origen_ip, origen_declarado, agente, detalle, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $5)`,
        [
          h.copropiedadId,
          h.ocurridoEn,
          h.tipo,
          h.usuarioId,
          h.actorId,
          h.sesionId ?? null,
          h.turnoId ?? null,
          h.duracionSegundos ?? null,
          ip !== null && isIP(ip) !== 0 ? ip : null,
          recortar(h.origen?.declarado, 100),
          recortar(h.origen?.agente, 300),
          recortar(h.detalle, 500),
        ],
      );
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  async consultar(q: ConsultaDeHechos): Promise<readonly HechoRegistrado[]> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(q.copropiedadId)),
      ]);
      const { rows } = await cliente.query<Fila>(
        `SELECT id, tipo, copropiedad_id, ocurrido_en, usuario_id, actor_id, sesion_id, turno_id,
                duracion_segundos, host(origen_ip) AS origen_ip, origen_declarado, agente, detalle
           FROM public.bitacora_de_porteria
          WHERE copropiedad_id = $1 AND ocurrido_en >= $2 AND ocurrido_en < $3
            AND ($4::text[] IS NULL OR tipo = ANY($4::text[]))
          ORDER BY ocurrido_en DESC
          LIMIT $5`,
        [q.copropiedadId, q.desde, q.hasta, q.tipos === undefined ? null : [...q.tipos], q.limite],
      );
      return rows.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        copropiedadId: f.copropiedad_id,
        ocurridoEn: f.ocurrido_en,
        usuarioId: f.usuario_id,
        actorId: f.actor_id,
        sesionId: f.sesion_id,
        turnoId: f.turno_id,
        duracionSegundos: f.duracion_segundos,
        origen: { ip: f.origen_ip, declarado: f.origen_declarado, agente: f.agente },
        detalle: f.detalle,
      }));
    } finally {
      await cliente.query("SELECT set_config('request.jwt.claims', '', false)");
      cliente.release();
    }
  }
}
