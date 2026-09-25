import type { Pool, PoolClient } from 'pg';
import type { Rol } from '../../autenticacion';
import type {
  AccionManual,
  BitacoraDeOrdenes,
  EstadoDeAccionamiento,
  OrdenEjecutada,
} from '../aplicacion/apertura-manual';
import { claimsDeServicio } from '../../comun/claims-de-servicio';

/**
 * LA BITÁCORA DE ÓRDENES MANUALES EN POSTGRESQL · ETAPA 15-E (D-139)
 *
 * Una orden de portería es rastro de RN-08: quién abrió o negó, cuándo, con
 * qué motivo y cómo acabó. En memoria se perdía al reiniciar; aquí va a
 * `ordenes_manuales` (migración 0036) con los claims de SERVICIO de la
 * copropiedad. El rastro se escribe ANTES de accionar (`registrar`) y el
 * desenlace después (`anotarResultado`): si lo segundo falla, lo primero
 * sigue ahí, que es lo que una bitácora tiene que garantizar.
 */
interface FilaOrden {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly accion: AccionManual;
  readonly motivo: string;
  readonly operador_id: string;
  readonly rol: Rol;
  readonly dispositivo_id: string;
  readonly momento: Date;
  readonly evento_id: string | null;
  readonly resultado: EstadoDeAccionamiento | null;
  readonly detalle: string | null;
}

const CAMPOS = `id, copropiedad_id, accion, motivo, operador_id, rol, dispositivo_id, momento,
  evento_id, resultado, detalle`;

const aOrden = (f: FilaOrden): OrdenEjecutada => ({
  id: f.id,
  copropiedadId: f.copropiedad_id,
  accion: f.accion,
  motivo: f.motivo,
  operadorId: f.operador_id,
  rol: f.rol,
  dispositivoId: f.dispositivo_id,
  momento: f.momento,
  eventoId: f.evento_id,
  resultado: f.resultado,
  detalle: f.detalle,
});

export class BitacoraDeOrdenesPg implements BitacoraDeOrdenes {
  constructor(private readonly pool: Pool) {}

  private async conServicio<T>(
    copropiedadId: string,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
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

  async registrar(orden: OrdenEjecutada): Promise<void> {
    await this.conServicio(orden.copropiedadId, async (c) => {
      await c.query(
        `INSERT INTO public.ordenes_manuales (id, copropiedad_id, accion, motivo, operador_id, rol,
           dispositivo_id, momento, evento_id, resultado, detalle, creado_por, actualizado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$5,$5)
         ON CONFLICT (id) DO NOTHING`,
        [
          orden.id,
          orden.copropiedadId,
          orden.accion,
          orden.motivo,
          orden.operadorId,
          orden.rol,
          orden.dispositivoId,
          orden.momento,
          orden.eventoId,
          orden.resultado ?? null,
          orden.detalle ?? null,
        ],
      );
    });
  }

  async anotarResultado(
    copropiedadId: string,
    id: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void> {
    await this.conServicio(copropiedadId, async (c) => {
      await c.query(
        `UPDATE public.ordenes_manuales SET resultado = $3, detalle = $4
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, id, resultado, detalle === null ? null : detalle.slice(0, 500)],
      );
    });
  }

  async ultimas(copropiedadId: string, cuantas: number): Promise<readonly OrdenEjecutada[]> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<FilaOrden>(
        `SELECT ${CAMPOS} FROM public.ordenes_manuales
          WHERE copropiedad_id = $1 ORDER BY momento DESC LIMIT $2`,
        [copropiedadId, Math.max(1, Math.min(cuantas, 200))],
      );
      return rows.map(aOrden);
    });
  }
}
