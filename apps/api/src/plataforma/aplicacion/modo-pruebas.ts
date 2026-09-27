import type { AjustesDePlataforma } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H5 (15-L) · EL MODO PRUEBAS, LEÍDO DE LA BASE SIN REINICIAR
 *
 * Con el modo activo, las restricciones de porteros se EVALÚAN y se registran
 * como «habría sido rechazado», sin bloquear; no hay bloqueo por intentos
 * fallidos; y el límite de peticiones sube —no se apaga (§2.7.5)—.
 *
 * Se relee cada pocos segundos: apagarlo desde la consola surte efecto sin
 * reiniciar la API. Si la base no contesta, vale lo último que se leyó; sin
 * lectura previa, INACTIVO: ante la duda, las restricciones se aplican
 * (§2.1.4, denegar por defecto).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const VIGENCIA_DEL_MODO_MS = 3000;

export class ModoPruebas {
  private leido: { readonly valor: boolean; readonly enMs: number } | null = null;

  constructor(
    private readonly ajustes: AjustesDePlataforma,
    private readonly ahoraMs: () => number = () => Date.now(),
  ) {}

  async activo(): Promise<boolean> {
    const ahora = this.ahoraMs();
    if (this.leido !== null && ahora - this.leido.enMs < VIGENCIA_DEL_MODO_MS) {
      return this.leido.valor;
    }
    try {
      const valor = await this.ajustes.modoPruebas();
      this.leido = { valor, enMs: ahora };
      return valor;
    } catch {
      return this.leido?.valor ?? false;
    }
  }

  /** Lo cambia (auditado en la base) y lo aplica en el acto en este proceso. */
  async cambiar(activo: boolean, actorId: string, ip: string | null): Promise<void> {
    await this.ajustes.fijarModoPruebas(activo, actorId, ip);
    this.leido = { valor: activo, enMs: this.ahoraMs() };
  }
}
