import type { Pool } from 'pg';
import type {
  EjecucionDeOperaciones,
  OperacionesDeDispositivo,
  ResultadoDeOperacion,
  SolicitudDeOperacion,
} from '../aplicacion/operaciones-de-dispositivo';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS OPERACIONES DE DISPOSITIVO, CON RASTRO EN LA BASE · 15-R, bloque A2
 *
 * Decora al adaptador declarativo (`OperacionesEnMemoria`), que sigue siendo
 * quien registra la orden en la bitácora y quien dice —sin disimularlo— que
 * ninguna llega todavía al equipo (H-SITIO-02). Lo que añade es lo que en
 * memoria se perdía al reiniciar: la fila atribuida en
 * `operaciones_de_dispositivo` (0051), de la que salen las pendientes.
 *
 * La fila se escribe ANTES de responder: una orden que la consola dio por
 * registrada tiene que existir aunque la API se caiga un segundo después.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class OperacionesConRastroPg implements OperacionesDeDispositivo {
  constructor(
    private readonly pool: Pool,
    private readonly declarativa: OperacionesDeDispositivo,
  ) {}

  async solicitar(s: SolicitudDeOperacion): Promise<ResultadoDeOperacion> {
    await conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(s.copropiedadId)),
      ]);
      await c.query(
        `INSERT INTO public.operaciones_de_dispositivo
           (copropiedad_id, dispositivo_id, operacion, solicitada_por, solicitada_en,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $4, $4)`,
        [s.copropiedadId, s.dispositivoId, s.operacion, s.solicitadaPor, s.solicitadaEn],
      );
    });
    return this.declarativa.solicitar(s);
  }

  async pendientesDe(copropiedadId: string): Promise<readonly string[]> {
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      const { rows } = await c.query<{ dispositivo_id: string }>(
        `SELECT DISTINCT dispositivo_id FROM public.operaciones_de_dispositivo
          WHERE copropiedad_id = $1 AND estado = 'pendiente'`,
        [copropiedadId],
      );
      return rows.map((r) => r.dispositivo_id);
    });
  }

  ejecucion(): EjecucionDeOperaciones {
    return this.declarativa.ejecucion();
  }
}
