/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E1 (15-M) · LA MARCA «ESTA CREDENCIAL YA FUE RECHAZADA», POR EQUIPO
 *
 * Estos equipos bloquean la dirección de origen tras unos pocos inicios de
 * sesión fallidos. La marca dice «no la vuelvas a presentar» y la comparten
 * TODAS las conexiones al mismo equipo con la misma credencial: las órdenes,
 * los sondeos y la escucha larga. Lo que NO comparten desde la 15-M es el
 * desafío (nonce y `nc`): ése puede ser por conexión (E1-c). Por eso la marca
 * vive aparte de la sesión.
 *
 * Se borra sola al pasar la ventana, al editar la credencial (la sesión y la
 * marca son otras) y cuando una persona pulsa «Probar conexión» (E1-e): ese
 * botón es la decisión humana de presentar la clave una vez más.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class MarcaDeCredencial {
  private rechazadaEn: number | null = null;
  /** Si el equipo dijo cuánto dura su bloqueo, hasta cuándo no se presenta. */
  private bloqueadaHasta: number | null = null;

  marcarRechazada(ahora: number, bloqueoMs: number | null = null): void {
    this.rechazadaEn = ahora;
    this.bloqueadaHasta = bloqueoMs === null ? null : ahora + bloqueoMs;
  }

  /** Cuánto hace que el equipo la rechazó, o `null` si ya se puede presentar. */
  rechazadaHace(ahora: number, ventanaMs: number): number | null {
    if (this.rechazadaEn === null) return null;
    const hace = ahora - this.rechazadaEn;
    const vigente =
      hace < ventanaMs || (this.bloqueadaHasta !== null && ahora < this.bloqueadaHasta);
    if (vigente) return hace;
    this.olvidar();
    return null;
  }

  /** Segundos que le quedan al bloqueo que el equipo declaró, si lo declaró. */
  segundosDeBloqueo(ahora: number): number | null {
    if (this.bloqueadaHasta === null || ahora >= this.bloqueadaHasta) return null;
    return Math.ceil((this.bloqueadaHasta - ahora) / 1000);
  }

  olvidar(): void {
    this.rechazadaEn = null;
    this.bloqueadaHasta = null;
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E1-c (15-M) · EL `nc` ES POR NONCE, Y EL NONCE PUEDE SER DE VARIAS CONEXIONES
 *
 * Un equipo que deriva el nonce del reloj le da el MISMO a todo el que llega
 * sin credencial (H-SITIO-12): dos conexiones con sesión propia lo comparten
 * sin saberlo y, si cada una contara por su lado, repetirían `nc` y el equipo
 * las rechazaría. El contador vive aquí, por equipo y por VALOR de nonce, y
 * todas las sesiones del equipo piden el siguiente número al mismo sitio.
 * Se recuerdan los últimos nonces y nada más: el resto ya no volverá.
 */
export class ContadorDeNonces {
  private readonly cuentas = new Map<string, number>();

  siguiente(nonce: string): number {
    const n = (this.cuentas.get(nonce) ?? 0) + 1;
    this.cuentas.delete(nonce);
    this.cuentas.set(nonce, n);
    // Acotado: los nonces viejos no vuelven (el equipo los invalidó).
    if (this.cuentas.size > 16) {
      const primero = this.cuentas.keys().next().value;
      if (primero !== undefined) this.cuentas.delete(primero);
    }
    return n;
  }

  /** Cuántas peticiones lleva este nonce, para las pruebas y el diagnóstico. */
  cuenta(nonce: string): number {
    return this.cuentas.get(nonce) ?? 0;
  }
}

/** Lo que TODAS las sesiones Digest del mismo equipo y credencial comparten. */
export interface CompartidoDelEquipo {
  readonly marca: MarcaDeCredencial;
  readonly nonces: ContadorDeNonces;
}

export const compartidoNuevo = (): CompartidoDelEquipo => ({
  marca: new MarcaDeCredencial(),
  nonces: new ContadorDeNonces(),
});
