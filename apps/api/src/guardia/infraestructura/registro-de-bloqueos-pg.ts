import type { Pool, PoolClient } from 'pg';
import type { Rol } from '../../autenticacion';
import type { BloqueoVigente, RegistroDeBloqueos } from '../aplicacion/bloqueo-de-acceso';
import type { EstadoDeAccionamiento } from '../aplicacion/apertura-manual';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS BLOQUEOS DE ACCESO, EN LA BASE · 15-R, bloque A2 (D-140)
 *
 * En memoria, un reinicio de la API «desbloqueaba» en la consola un acceso que
 * el equipo SIGUE teniendo bloqueado: la vista de quién lo dejó así, y por qué,
 * desaparecía justo cuando el portero la necesita. `bloqueos_de_acceso` (0051)
 * guarda el estado VIGENTE por equipo; escribe sólo el servicio de la
 * copropiedad (la API, que ya validó rol, alcance y motivo).
 * ═════════════════════════════════════════════════════════════════════════════
 */
interface FilaBloqueo {
  readonly copropiedad_id: string;
  readonly dispositivo_id: string;
  readonly bloqueado: boolean;
  readonly motivo: string;
  readonly operador_id: string;
  readonly rol: Rol;
  readonly desde: Date;
  readonly resultado: EstadoDeAccionamiento | null;
  readonly detalle: string | null;
}

const CAMPOS = `copropiedad_id, dispositivo_id, bloqueado, motivo, operador_id, rol, desde,
  resultado, detalle`;

const aBloqueo = (f: FilaBloqueo): BloqueoVigente => ({
  copropiedadId: f.copropiedad_id,
  dispositivoId: f.dispositivo_id,
  bloqueado: f.bloqueado,
  motivo: f.motivo,
  operadorId: f.operador_id,
  rol: f.rol,
  desde: f.desde,
  resultado: f.resultado,
  detalle: f.detalle,
});

export class RegistroDeBloqueosPg implements RegistroDeBloqueos {
  constructor(private readonly pool: Pool) {}

  async fijar(b: BloqueoVigente): Promise<void> {
    await this.conServicio(b.copropiedadId, async (c) => {
      await c.query(
        `INSERT INTO public.bloqueos_de_acceso
           (copropiedad_id, dispositivo_id, bloqueado, motivo, operador_id, rol, desde,
            resultado, detalle, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $5, $5)
         ON CONFLICT (copropiedad_id, dispositivo_id) DO UPDATE
           SET bloqueado = EXCLUDED.bloqueado, motivo = EXCLUDED.motivo,
               operador_id = EXCLUDED.operador_id, rol = EXCLUDED.rol,
               desde = EXCLUDED.desde, resultado = EXCLUDED.resultado,
               detalle = EXCLUDED.detalle, actualizado_por = EXCLUDED.actualizado_por,
               actualizado_en = now()`,
        [
          b.copropiedadId,
          b.dispositivoId,
          b.bloqueado,
          b.motivo,
          b.operadorId,
          b.rol,
          b.desde,
          b.resultado,
          b.detalle,
        ],
      );
    });
  }

  async anotarResultado(
    copropiedadId: string,
    dispositivoId: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void> {
    await this.conServicio(copropiedadId, async (c) => {
      await c.query(
        `UPDATE public.bloqueos_de_acceso SET resultado = $3, detalle = $4, actualizado_en = now()
          WHERE copropiedad_id = $1 AND dispositivo_id = $2`,
        [copropiedadId, dispositivoId, resultado, detalle],
      );
    });
  }

  async vigente(copropiedadId: string, dispositivoId: string): Promise<BloqueoVigente | null> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<FilaBloqueo>(
        `SELECT ${CAMPOS} FROM public.bloqueos_de_acceso
          WHERE copropiedad_id = $1 AND dispositivo_id = $2`,
        [copropiedadId, dispositivoId],
      );
      const fila = rows[0];
      return fila === undefined ? null : aBloqueo(fila);
    });
  }

  async todos(copropiedadId: string): Promise<readonly BloqueoVigente[]> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<FilaBloqueo>(
        `SELECT ${CAMPOS} FROM public.bloqueos_de_acceso WHERE copropiedad_id = $1
          ORDER BY desde DESC`,
        [copropiedadId],
      );
      return rows.map(aBloqueo);
    });
  }

  private async conServicio<T>(
    copropiedadId: string,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    return conCliente(this.pool, async (cliente) => {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(cliente);
    });
  }
}
