import type { Bitacora } from '@ncr/domain-core';
import type { TunelesDeEdge } from '../../proveedores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A3 · EL EDGE SE DESCONECTÓ: la nube ya no alcanza los equipos
 *
 * Con puente, sin túnel la API no puede abrir una barrera ni contestar a una
 * terminal de ese conjunto (C3). Eso es una alerta para la central (RN-18), y
 * va por la deduplicación existente (`AbrirAlertaDeEquipo`, 15-M):
 *
 *  · UNA por equipo activo del conjunto, tipo `dispositivo_caido`, clave
 *    `edge-desconectado`, persistente: mientras siga abierta no se repite.
 *    [SUPUESTO] S-185 · por equipo y no una sola: `alertas` exige un equipo o
 *    un evento (D-16: el Edge no es un dispositivo) y el dominio no se toca.
 *    Para quien mira la consola es además lo cierto: es ESE equipo el que la
 *    nube no alcanza. Se resuelven solas cuando el sondeo por el túnel vuelve
 *    a contestar (A1, 15-N), sin código nuevo.
 *  · Con GRACIA (`graciaMs`): un Edge que se reinicia o cambia de red vuelve en
 *    segundos, y abrir una alerta por equipo en cada parpadeo es enseñar a la
 *    central a ignorarlas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const GRACIA_DE_DESCONEXION_MS = 30_000;
export const CLAVE_EDGE_DESCONECTADO = 'edge-desconectado';

export interface EquiposDelConjunto {
  activos(): Promise<readonly { readonly dispositivoId: string; readonly copropiedadId: string }[]>;
}

export interface AlertaParaEquipo {
  ejecutar(
    nueva: {
      readonly copropiedadId: string;
      readonly dispositivoId: string;
      readonly tipo: 'dispositivo_caido';
      readonly severidad: 'alta';
      readonly clave: string;
      readonly notas: string;
      readonly persistente: boolean;
    },
    actorId: string,
  ): Promise<unknown>;
}

export interface Temporizador {
  esperar(ms: number, hacer: () => void): void;
}

const TEMPORIZADOR_REAL: Temporizador = {
  esperar: (ms, hacer) => void setTimeout(hacer, ms).unref(),
};

export class AlertaDeDesconexion {
  constructor(
    private readonly tuneles: TunelesDeEdge,
    private readonly equipos: EquiposDelConjunto,
    private readonly alertas: AlertaParaEquipo,
    private readonly actorId: string,
    private readonly bitacora: Bitacora,
    private readonly graciaMs: number = GRACIA_DE_DESCONEXION_MS,
    private readonly temporizador: Temporizador = TEMPORIZADOR_REAL,
  ) {}

  vigilar(): void {
    this.tuneles.alCambiar((copropiedadId, evento, edgeId) => {
      if (evento !== 'desconectado') return;
      this.temporizador.esperar(this.graciaMs, () => void this.siSigue(copropiedadId, edgeId));
    });
  }

  /** Devuelve cuántas alertas pidió abrir (0 si el Edge ya volvió). */
  async siSigue(copropiedadId: string, edgeId: string): Promise<number> {
    const estado = this.tuneles.estadoDe(copropiedadId);
    if (estado.conectado) return 0;
    try {
      const equipos = (await this.equipos.activos()).filter(
        (e) => e.copropiedadId === copropiedadId,
      );
      const desde = estado.desde?.toISOString() ?? 'hace un momento';
      for (const { dispositivoId } of equipos) {
        await this.alertas.ejecutar(
          {
            copropiedadId,
            dispositivoId,
            tipo: 'dispositivo_caido',
            severidad: 'alta',
            clave: CLAVE_EDGE_DESCONECTADO,
            notas:
              `El Edge del conjunto no está conectado desde ${desde}: la nube no alcanza ` +
              'este equipo. El Edge sigue decidiendo con su caché y lo reconciliará.',
            persistente: true,
          },
          this.actorId,
        );
      }
      return equipos.length;
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo alertar la desconexión del Edge', {
        edgeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}
