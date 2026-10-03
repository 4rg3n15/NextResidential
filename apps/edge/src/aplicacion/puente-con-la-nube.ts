/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · B2 · CON NUBE, DECIDE LA NUBE; SIN RESPUESTA A TIEMPO, EL EDGE
 *
 * Cada hecho que un equipo le reporta al Edge (B1) se reenvía por el túnel
 * como pedido `publicacion`, con su clave de idempotencia y un PLAZO
 * (`EDGE_PLAZO_NUBE_MS`). Mientras tanto la nube decide y, si hay que abrir,
 * la orden vuelve por el mismo túnel y la ejecuta el ejecutor de este Edge.
 *
 * El estado de cada hecho es lo que garantiza UN SOLO ACTOR:
 *
 *   esperando ──(llega una orden de la nube con este hecho)──▶ nube
 *       │                                                       (el Edge ya
 *       └──(vence el plazo, o no hay túnel)──▶ edge              no decide)
 *                                              (la orden tardía de la nube se
 *                                               rechaza: HechoYaResueltoEnElEdge)
 *
 * El paso es atómico porque el proceso tiene un solo hilo: o llega antes la
 * orden, o vence antes el plazo; nunca las dos cosas cuentan.
 *
 * Lo que la nube contesta con un error que NO es del túnel (`EquipoNoRegistrado`:
 * el equipo no es de este conjunto para la nube) no se decide aquí: RN-15, y
 * denegar por defecto. Cualquier otro fallo de la nube (su base caída) sí cae a
 * la caché: es exactamente el caso para el que existe el Edge.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { randomUUID } from 'node:crypto';
import type {
  IngestorDePublicaciones,
  PublicacionDeEquipo,
  ResultadoDeIngesta,
  SesionDeTunel,
} from '@ncr/providers';

type EstadoDelHecho = 'esperando' | 'nube' | 'edge';

export interface OpcionesDelPuente {
  readonly plazoMs: number;
  /** Cuánto se recuerda un hecho para contestar a una orden que llegue tarde. */
  readonly memoriaMs?: number;
  readonly ahora?: () => number;
  readonly registrar?: (nivel: 'info' | 'aviso', mensaje: string, contexto?: unknown) => void;
}

/**
 * Lo que la nube contesta para decir «no» con razón: el equipo no es de este
 * conjunto, o el Edge habló mal. Todo lo demás —el túnel, un plazo, la base de
 * la nube caída— es «no pudo», y entonces decide el Edge con su caché. Por
 * nombre: este fichero no depende de las clases del paquete.
 */
const RECHAZOS_DE_LA_NUBE = new Set(['EquipoNoRegistrado', 'ProtocoloInvalido']);

export class PuenteConLaNube implements IngestorDePublicaciones {
  private readonly hechos = new Map<string, { estado: EstadoDelHecho; desde: number }>();

  constructor(
    /** La decisión local con caché: la contingencia de la 15-Q, sin modificar. */
    private readonly local: IngestorDePublicaciones,
    private readonly tunel: () => SesionDeTunel | null,
    private readonly opciones: OpcionesDelPuente,
  ) {}

  async ingerir(publicacion: PublicacionDeEquipo): Promise<ResultadoDeIngesta> {
    this.purgar();
    const sesion = this.tunel();
    if (sesion === null) return this.local.ingerir(publicacion);
    const hechoId = randomUUID();
    this.hechos.set(hechoId, { estado: 'esperando', desde: this.ahora() });
    try {
      const r = (await sesion.pedir(
        'publicacion',
        { hechoId, publicacion },
        { plazoMs: this.opciones.plazoMs, clave: hechoId },
      )) as { desenlace?: string; motivo?: string | null };
      this.marcar(hechoId, 'nube');
      return {
        registrado: r.desenlace === 'ingerida' || r.desenlace === 'historica',
        motivo: r.motivo ?? null,
      };
    } catch (error) {
      const nombre = error instanceof Error ? error.name : 'desconocido';
      if (RECHAZOS_DE_LA_NUBE.has(nombre)) {
        this.marcar(hechoId, 'nube');
        return { registrado: false, motivo: `la nube rechazó el hecho: ${nombre}` };
      }
      if (this.hechos.get(hechoId)?.estado === 'nube') {
        // La nube ya mandó su orden para este hecho: ella lo resolvió.
        return { registrado: true, motivo: null };
      }
      this.marcar(hechoId, 'edge');
      this.opciones.registrar?.('aviso', 'la nube no contestó a tiempo: decide el Edge', {
        motivo: nombre,
        dispositivoId: publicacion.evento.dispositivoId,
      });
      return this.local.ingerir(publicacion);
    }
  }

  /**
   * Para el ejecutor (`padreVigente`): ¿puede la nube actuar sobre este hecho?
   * La primera orden lo pasa a `nube`. Uno que el Edge resolvió, o que no
   * conoce (reiniciado, olvidado), NO: denegar por defecto.
   */
  enManosDeLaNube(hechoId: string): boolean {
    const hecho = this.hechos.get(hechoId);
    if (hecho === undefined || hecho.estado === 'edge') return false;
    hecho.estado = 'nube';
    return true;
  }

  private marcar(hechoId: string, estado: EstadoDelHecho): void {
    const hecho = this.hechos.get(hechoId);
    if (hecho !== undefined && hecho.estado === 'esperando') hecho.estado = estado;
  }

  private purgar(): void {
    const limite = this.ahora() - (this.opciones.memoriaMs ?? 5 * 60_000);
    for (const [id, h] of this.hechos) if (h.desde < limite) this.hechos.delete(id);
  }

  private ahora(): number {
    return this.opciones.ahora?.() ?? Date.now();
  }
}
