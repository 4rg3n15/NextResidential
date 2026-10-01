import { randomBytes } from 'node:crypto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · EL BILLETE DEL WEBSOCKET DE AUDIO: UN SOLO USO, 15 s, ESTA IP
 *
 * El WebSocket no lleva el token de sesión —un navegador no puede ponerle
 * cabeceras, y en la URL acabaría en algún registro—. Lo que lleva es un
 * billete que emite una petición HTTP normal (`POST …/billete`), que SÍ pasa
 * por todos los guardas: sesión, rol, copropiedad, equipo de la ruta, IP de
 * guardia remota y el turno con el canal del equipo abierto. El billete:
 *
 *  · vale UNA vez: se borra al presentarlo, acierte o no;
 *  · caduca a los 15 s;
 *  · sólo vale desde la IP que lo pidió;
 *  · no se registra en ningún sitio: vive en la memoria de este proceso.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface DatosDelBillete {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly operadorId: string;
  readonly ip: string | null;
}

export const VIGENCIA_DEL_BILLETE_S = 15;
/** Más billetes vivos que esto es un abuso: el POST ya tiene su límite. */
const BILLETES_VIVOS_MAXIMOS = 1000;

export class BilletesDeAudio {
  private readonly vivos = new Map<string, DatosDelBillete & { readonly caduca: number }>();

  constructor(private readonly ahora: () => number = () => Date.now()) {}

  emitir(datos: DatosDelBillete): string {
    this.purgar();
    if (this.vivos.size >= BILLETES_VIVOS_MAXIMOS) {
      const masViejo = this.vivos.keys().next().value;
      if (masViejo !== undefined) this.vivos.delete(masViejo);
    }
    const billete = randomBytes(32).toString('base64url');
    this.vivos.set(billete, { ...datos, caduca: this.ahora() + VIGENCIA_DEL_BILLETE_S * 1000 });
    return billete;
  }

  /** Los datos si el billete vale desde esta IP; `null` si no. Se gasta igual. */
  consumir(billete: string, ip: string | null): DatosDelBillete | null {
    const datos = this.vivos.get(billete);
    this.vivos.delete(billete);
    if (datos === undefined || datos.caduca < this.ahora() || datos.ip !== ip) return null;
    return {
      copropiedadId: datos.copropiedadId,
      dispositivoId: datos.dispositivoId,
      operadorId: datos.operadorId,
      ip: datos.ip,
    };
  }

  private purgar(): void {
    const ahora = this.ahora();
    for (const [b, d] of this.vivos) if (d.caduca < ahora) this.vivos.delete(b);
  }
}
