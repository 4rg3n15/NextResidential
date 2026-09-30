import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import type {
  EventoDeEquipoGuardado,
  EventoDeEquipoNuevo,
  FiltroDeEventosDeEquipo,
  RepositorioEventosDeEquipo,
} from '../aplicacion/eventos-de-equipo';

/**
 * `eventos_de_equipo` (0040) en PostgreSQL, con los claims de SERVICIO de la
 * copropiedad del evento en cada llamada: la RLS está forzada y la ingesta no
 * tiene token de usuario. El filtro de aplicación que pide §2.7.6 para las
 * rutas de servicio lo hace el que llama —la copropiedad sale del registro de
 * equipos (R1) o de la ruta ya validada—, y la clave ajena compuesta al equipo
 * lo sostiene además en la base.
 *
 * Reenvío del equipo = misma clave = `ON CONFLICT DO NOTHING` (B3).
 */
interface Fila {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly dispositivo_id: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly codigo_mayor: number | null;
  readonly codigo_menor: number | null;
  readonly origen: 'equipo' | 'plataforma';
  readonly en_vivo: boolean;
  readonly ocurrido_en: Date;
  readonly hora_del_equipo: string | null;
  readonly recibido_en: Date;
  readonly evento_id: string | null;
  readonly clave_idempotencia: string;
  readonly carga: Record<string, unknown>;
  readonly creado_por: string;
}

const COLUMNAS =
  'copropiedad_id, dispositivo_id, tipo, titulo, codigo_mayor, codigo_menor, origen, en_vivo, ' +
  'ocurrido_en, hora_del_equipo, evento_id, clave_idempotencia, carga, creado_por';
const POR_FILA = 14;

const valores = (e: EventoDeEquipoNuevo): unknown[] => [
  e.copropiedadId,
  e.dispositivoId,
  e.tipo,
  e.titulo,
  e.codigoMayor,
  e.codigoMenor,
  e.origen,
  e.enVivo,
  e.ocurridoEn,
  e.horaDelEquipo,
  e.eventoId,
  e.claveIdempotencia,
  JSON.stringify(e.carga),
  e.creadoPor,
];

const aGuardado = (f: Fila): EventoDeEquipoGuardado => ({
  id: f.id,
  copropiedadId: f.copropiedad_id,
  dispositivoId: f.dispositivo_id,
  tipo: f.tipo,
  titulo: f.titulo,
  codigoMayor: f.codigo_mayor,
  codigoMenor: f.codigo_menor,
  origen: f.origen,
  enVivo: f.en_vivo,
  ocurridoEn: new Date(f.ocurrido_en),
  horaDelEquipo: f.hora_del_equipo,
  recibidoEn: new Date(f.recibido_en),
  eventoId: f.evento_id,
  claveIdempotencia: f.clave_idempotencia,
  carga: f.carga,
  creadoPor: f.creado_por,
});

export class RepositorioEventosDeEquipoPg implements RepositorioEventosDeEquipo {
  constructor(private readonly pool: Pool) {}

  private async como<T>(copropiedadId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  async registrar(e: EventoDeEquipoNuevo): Promise<EventoDeEquipoGuardado | null> {
    return this.como(e.copropiedadId, async (c) => {
      const { rows } = await c.query<Fila>(
        `INSERT INTO public.eventos_de_equipo (${COLUMNAS})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
         ON CONFLICT (copropiedad_id, clave_idempotencia) DO NOTHING
         RETURNING *`,
        valores(e),
      );
      const fila = rows[0];
      return fila === undefined ? null : aGuardado(fila);
    });
  }

  async registrarVarios(eventos: readonly EventoDeEquipoNuevo[]): Promise<number> {
    // Un lote por copropiedad: los claims de servicio son de UNA.
    const porCopropiedad = new Map<string, EventoDeEquipoNuevo[]>();
    for (const e of eventos) {
      const lista = porCopropiedad.get(e.copropiedadId) ?? [];
      lista.push(e);
      porCopropiedad.set(e.copropiedadId, lista);
    }
    let nuevos = 0;
    for (const [copropiedadId, lista] of porCopropiedad) {
      nuevos += await this.como(copropiedadId, async (c) => {
        const marcadores = lista.map(
          (_, i) =>
            `(${Array.from({ length: POR_FILA }, (__, j) => {
              const n = i * POR_FILA + j + 1;
              return j === 12 ? `$${String(n)}::jsonb` : `$${String(n)}`;
            }).join(',')})`,
        );
        const { rowCount } = await c.query(
          `INSERT INTO public.eventos_de_equipo (${COLUMNAS})
           VALUES ${marcadores.join(',')}
           ON CONFLICT (copropiedad_id, clave_idempotencia) DO NOTHING`,
          lista.flatMap(valores),
        );
        return rowCount ?? 0;
      });
    }
    return nuevos;
  }

  async consultar(f: FiltroDeEventosDeEquipo): Promise<readonly EventoDeEquipoGuardado[]> {
    return this.como(f.copropiedadId, async (c) => {
      const parametros: unknown[] = [f.copropiedadId, f.desde, f.hasta];
      // G1 (15-N) · por recepción, la cola de atención (índice de la 0046).
      const columna = f.porRecepcion === true ? 'recibido_en' : 'ocurrido_en';
      const condiciones = ['copropiedad_id = $1', `${columna} >= $2`, `${columna} < $3`];
      if (f.soloEnVivo === true) condiciones.push("en_vivo AND origen = 'equipo'");
      if (f.tipos !== undefined && f.tipos !== null) {
        parametros.push([...f.tipos]);
        condiciones.push(`tipo = ANY($${String(parametros.length)}::text[])`);
      }
      if (f.dispositivoId !== undefined && f.dispositivoId !== null) {
        parametros.push(f.dispositivoId);
        condiciones.push(`dispositivo_id = $${String(parametros.length)}`);
      }
      if (f.tipo !== undefined && f.tipo !== null) {
        parametros.push(f.tipo);
        condiciones.push(`tipo = $${String(parametros.length)}`);
      }
      parametros.push(f.limite);
      const { rows } = await c.query<Fila>(
        `SELECT * FROM public.eventos_de_equipo
          WHERE ${condiciones.join(' AND ')}
          ORDER BY ${columna} DESC, recibido_en DESC
          LIMIT $${String(parametros.length)}`,
        parametros,
      );
      return rows.map(aGuardado);
    });
  }
}
