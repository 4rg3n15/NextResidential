import { randomBytes } from 'node:crypto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D1 · BILLETES DE UN SOLO USO, LIGADOS A UN PROPÓSITO
 *
 * La consola (en Netlify, P-20) abre el SSE DIRECTO contra la API, sin pasar
 * por su proxy. `EventSource` no puede llevar cabeceras y el token de sesión
 * vive en una cookie `httpOnly` de OTRO origen: lo que viaja en la URL es un
 * billete que emitió una petición normal —que sí pasó por sesión, rol,
 * copropiedad y lista blanca de IP—. Mismas reglas que el billete del audio
 * (`billetes-de-audio.ts`, 15-P), generalizadas:
 *
 *  · vale UNA vez: se borra al presentarlo, acierte o no;
 *  · caduca a los `vigenciaS` segundos;
 *  · sólo vale desde la IP que lo pidió;
 *  · vale para UN propósito: cada almacén es de uno, y el propósito va además
 *    dentro del billete, así que el de un flujo no abre otro canal;
 *  · no se registra: vive en la memoria del proceso (P-30: una instancia).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface DatosLigados {
  readonly ip: string | null;
}

/** Más billetes vivos que esto es un abuso: la ruta que los emite ya tiene su límite. */
const VIVOS_MAXIMOS = 1000;

export class BilletesDeUnSoloUso<T extends DatosLigados> {
  private readonly vivos = new Map<string, { readonly datos: T; readonly caduca: number }>();

  constructor(
    readonly proposito: string,
    private readonly vigenciaS: number,
    private readonly ahora: () => number = () => Date.now(),
  ) {}

  emitir(datos: T): { readonly billete: string; readonly caducaEn: Date } {
    this.purgar();
    if (this.vivos.size >= VIVOS_MAXIMOS) {
      const masViejo = this.vivos.keys().next().value;
      if (masViejo !== undefined) this.vivos.delete(masViejo);
    }
    const billete = `${this.proposito}.${randomBytes(32).toString('base64url')}`;
    const caduca = this.ahora() + this.vigenciaS * 1000;
    this.vivos.set(billete, { datos, caduca });
    return { billete, caducaEn: new Date(caduca) };
  }

  /** Los datos si el billete vale para ESTE propósito desde esta IP; `null` si no. Se gasta igual. */
  consumir(billete: string, ip: string | null): T | null {
    const vivo = this.vivos.get(billete);
    this.vivos.delete(billete);
    if (vivo === undefined || vivo.caduca < this.ahora() || vivo.datos.ip !== ip) return null;
    return billete.startsWith(`${this.proposito}.`) ? vivo.datos : null;
  }

  private purgar(): void {
    const ahora = this.ahora();
    for (const [b, v] of this.vivos) if (v.caduca < ahora) this.vivos.delete(b);
  }
}
