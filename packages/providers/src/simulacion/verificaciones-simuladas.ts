import type { OpcionesDeEquipo } from '../equipo/cliente';
import { EscuchaDeAlertStream } from '../equipo/escucha-alertstream';
import { TerminalFacial } from '../terminal/terminal-facial';
import type { VerificacionesDeLaPlataforma, VerificacionMedida } from '../ensayo/tipos';
import type { FlujoEnVivo } from './verificacion-remota-simulada';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F2 (corrección de la 15-L) · LA PLATAFORMA DEL `--simulado`, QUE CONTESTA LA
 * VERIFICACIÓN REMOTA Y MIDE CUÁNTO TARDA
 *
 * En sitio, la API escucha la terminal, decide y contesta, y registra cuánto
 * tardó; el ensayo lo lee de la base. En `--simulado` no hay API ni base, así
 * que esto hace su papel con las piezas DE PRODUCCIÓN: la terminal simulada
 * emite un reconocimiento con `remoteCheck` por su flujo en vivo, la escucha de
 * producción lo recibe, `TerminalFacial.responderVerificacion` contesta, y se
 * mide del hecho recibido al veredicto aceptado —la misma ventana que la API
 * anota en `duracionMs`—. Cada «presentación» es un ciclo completo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface TerminalConFlujo {
  readonly conexion: OpcionesDeEquipo;
  readonly flujo: FlujoEnVivo;
}

export class VerificacionesSimuladas implements VerificacionesDeLaPlataforma {
  private serie = 9000;

  constructor(
    private readonly terminal: TerminalConFlujo,
    private readonly reloj: () => number = () => performance.now(),
  ) {}

  async medidasDesde(
    _host: string,
    _desde: Date,
    cuantas: number,
    plazoMs: number,
  ): Promise<readonly VerificacionMedida[]> {
    const { conexion, flujo } = this.terminal;
    for (let i = 0; i < cuantas; i += 1) {
      this.serie += 1;
      flujo.emitir({
        eventType: 'AccessControllerEvent',
        dateTime: new Date().toISOString(),
        AccessControllerEvent: {
          majorEventType: 5,
          subEventType: 75,
          currentEvent: true,
          serialNo: this.serie,
          remoteCheck: true,
        },
      });
    }
    const cancelar = new AbortController();
    const plazo = setTimeout(() => cancelar.abort(), plazoMs);
    const escucha = new EscuchaDeAlertStream({
      ...conexion,
      dispositivoId: 'ensayo-simulado',
      familia: 'terminal',
      esperaMaximaMs: 1000,
    });
    const terminal = new TerminalFacial({ ...conexion, modo: 'reporta_y_espera' });
    const medidas: VerificacionMedida[] = [];
    try {
      for await (const evento of escucha.escuchar(cancelar.signal)) {
        if (!evento.esperaVeredicto) continue;
        const recibido = this.reloj();
        const r = await terminal.responderVerificacion('ensayo-simulado', {
          serie: evento.serieDelEquipo,
          permitido: true,
          motivo: 'ensayo simulado',
        });
        medidas.push({ duracionMs: this.reloj() - recibido, aceptado: r.aceptado });
        if (medidas.length >= cuantas) break;
      }
    } finally {
      clearTimeout(plazo);
      cancelar.abort();
    }
    return medidas;
  }
}
