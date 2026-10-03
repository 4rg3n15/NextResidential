import type { Pool } from 'pg';
import { ACTOR_INGESTA } from '../comun/actores-de-servicio';
import { conCliente } from '../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · R1 · POR DÓNDE SE LLEGA A CADA EQUIPO: directo, o por su Edge
 *
 * La elección es POR COPROPIEDAD y la dice la base, nunca una variable global:
 * un equipo cuya copropiedad tiene un Edge activo marcado como PUENTE
 * (`edge_gateways.puente`, 0050) se opera por el túnel de ese Edge; cualquier
 * otro, como hasta hoy (el portátil en sitio, las pruebas existentes).
 *
 * La respuesta se guarda `VIDA_MS` para no consultar la base en cada orden:
 * marcar o desmarcar el puente tarda, como mucho, eso en notarse.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface RutasDeEquipos {
  /** La copropiedad cuyo Edge es el puente de este equipo, o `null` si va directo. */
  puenteDe(dispositivoId: string): Promise<string | null>;
  /** El Edge puente de la COPROPIEDAD (para lo que aún no es un equipo: un alta). */
  edgeDe(copropiedadId: string): Promise<string | null>;
  /** Tras editar o dar de baja un equipo, o cambiar el puente: se vuelve a leer. */
  olvidar(dispositivoId?: string): void;
}

export const RUTAS_DE_EQUIPOS = Symbol.for('ncr.proveedores.RutasDeEquipos');

/** Sin base (la suite en memoria): todo va directo, como antes de la 15-Q2. */
export const TODO_DIRECTO: RutasDeEquipos = {
  puenteDe: () => Promise.resolve(null),
  edgeDe: () => Promise.resolve(null),
  olvidar: () => undefined,
};

const VIDA_MS = 5_000;
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los mismos claims de lectura que `RegistroDeEquiposPg`: una fila por id. */
const CLAIMS_DE_LECTURA = JSON.stringify({
  rol: 'superadministrador',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: null,
  copropiedades: [],
});

export class RutasDeEquiposPg implements RutasDeEquipos {
  private readonly memoria = new Map<string, { puente: string | null; hasta: number }>();

  constructor(
    private readonly pool: Pool,
    private readonly ahora: () => number = Date.now,
  ) {}

  puenteDe(dispositivoId: string): Promise<string | null> {
    return this.recordada(dispositivoId, () =>
      this.leer(
        `SELECT d.copropiedad_id AS valor
           FROM public.dispositivos d
           JOIN public.edge_gateways e
             ON e.copropiedad_id = d.copropiedad_id AND e.puente AND e.estado = 'activo'
          WHERE d.id = $1
          LIMIT 1`,
        dispositivoId,
      ),
    );
  }

  edgeDe(copropiedadId: string): Promise<string | null> {
    return this.recordada(`copropiedad:${copropiedadId}`, () =>
      this.leer(
        `SELECT e.id AS valor FROM public.edge_gateways e
          WHERE e.copropiedad_id = $1 AND e.puente AND e.estado = 'activo' LIMIT 1`,
        copropiedadId,
      ),
    );
  }

  private async recordada(clave: string, leer: () => Promise<string | null>) {
    const guardada = this.memoria.get(clave);
    if (guardada !== undefined && guardada.hasta > this.ahora()) return guardada.puente;
    const puente = ES_UUID.test(clave.replace('copropiedad:', '')) ? await leer() : null;
    this.memoria.set(clave, { puente, hasta: this.ahora() + VIDA_MS });
    return puente;
  }

  private leer(sql: string, id: string): Promise<string | null> {
    return conCliente(this.pool, async (cliente) => {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        CLAIMS_DE_LECTURA,
      ]);
      const { rows } = await cliente.query<{ valor: string }>(sql, [id]);
      return rows[0]?.valor ?? null;
    });
  }

  olvidar(dispositivoId?: string): void {
    if (dispositivoId === undefined) this.memoria.clear();
    else this.memoria.delete(dispositivoId);
  }
}
