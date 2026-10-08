import { juzgarDuplex } from '@ncr/providers';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B3 (15-S2) · EL SEMIDÚPLEX, MEDIDO EN LA CONVERSACIÓN · extensión E-09
 *
 * El 07/10 el operador no oía al equipo mientras hablaba. Ni la API ni la
 * consola detienen la bajada al hablar (se comprobó en el código); si calla,
 * es el EQUIPO, que en algunos modelos es semidúplex (ADR-01). Ningún campo
 * documentado lo declara, así que se MIDE: cada segundo se mira si el
 * operador estaba hablando (≥ 4000 B de subida, media tasa de G.711) o
 * callado (0 B), y cuánta bajada llegó. Con dos segundos de cada clase, la
 * misma regla que `pnpm sitio:audio` (`juzgarDuplex`) dice si el equipo calla
 * mientras recibe; la primera vez, la consola recibe el aviso y muestra el
 * turno de palabra.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const HABLANDO_B_POR_S = 4000;

export class MedidorDeDuplex {
  private subida = 0;
  private bajada = 0;
  private readonly suma = { hablando: { s: 0, b: 0 }, callado: { s: 0, b: 0 } };
  private avisado = false;

  contarSubida(bytes: number): void {
    this.subida += bytes;
  }

  contarBajada(bytes: number): void {
    this.bajada += bytes;
  }

  /** Cada segundo. `true` sólo la PRIMERA vez que el semidúplex queda medido. */
  tic(): boolean {
    const clase =
      this.subida >= HABLANDO_B_POR_S ? 'hablando' : this.subida === 0 ? 'callado' : null;
    if (clase !== null) {
      this.suma[clase].s += 1;
      this.suma[clase].b += this.bajada;
    }
    this.subida = 0;
    this.bajada = 0;
    const { hablando, callado } = this.suma;
    if (this.avisado || hablando.s < 2 || callado.s < 2) return false;
    this.avisado = juzgarDuplex(callado.b / callado.s, hablando.b / hablando.s) === 'semiduplex';
    return this.avisado;
  }
}
