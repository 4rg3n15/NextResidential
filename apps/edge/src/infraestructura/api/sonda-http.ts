/**
 * La sonda: ¿puede la nube DECIDIR ahora? Por eso `/ready` (API y base) y no
 * `/health` (sólo el proceso), desde la 15-Q: con la API en pie y la base
 * caída la nube no decide, y con P-27 (B) es justo cuando el Edge actúa.
 */
export class SondaHttp {
  constructor(
    private readonly urlBase: string,
    private readonly transporte: typeof fetch = fetch,
    private readonly tiempoLimiteMs = 3_000,
  ) {}

  async hayEnlace(): Promise<boolean> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), this.tiempoLimiteMs);
    try {
      const r = await this.transporte(`${this.urlBase}/ready`, { signal: control.signal });
      return r.ok;
    } catch {
      // Cualquier fallo es «no hay enlace». No se distingue el motivo porque la
      // respuesta del Edge es la misma: seguir solo.
      return false;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
