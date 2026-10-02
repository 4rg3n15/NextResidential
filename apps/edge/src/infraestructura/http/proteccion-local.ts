/**
 * 15-Q · Q5 · LO QUE PROTEGE CADA ENTRADA LOCAL DEL EDGE
 *
 * El Edge escucha en la red del conjunto: una cámara le publica, un integrador
 * le puede enviar un hecho, el técnico le pregunta el estado. Cada entrada se
 * protege con lo que el emisor PUEDE hacer:
 *
 *  · `/hechos` y `/estado` → HMAC con `EDGE_LOCAL_SECRETO` sobre marca, nonce,
 *    método, ruta y cuerpo; ventana de 60 s; y un nonce no se acepta dos veces
 *    dentro de ella (protección contra la repetición).
 *  · `/alarm-server/<secreto>` → la cámara NO puede firmar (su firmware publica
 *    un multipart sin cabeceras propias): secreto por cámara en la URL,
 *    comparado en tiempo constante, y el ORIGEN tiene que ser la IP declarada
 *    de esa cámara. Lo mismo que la API (`guardia-alarm-server.ts`). La
 *    repetición de una publicación no acciona dos veces: la frena la clave de
 *    idempotencia (`MemoriaDeAccesos`). [CONTRADICCIÓN] C-50 en la auditoría.
 *  · Todas → límite de cuerpo y de peticiones por IP y por minuto.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const CABECERA_MARCA = 'x-ncr-marca-temporal';
export const CABECERA_NONCE = 'x-ncr-nonce';
export const CABECERA_FIRMA = 'x-ncr-firma';
export const VENTANA_LOCAL_S = 60;

export const firmaLocal = (
  secreto: string,
  marca: string,
  nonce: string,
  metodo: string,
  ruta: string,
  cuerpo: string,
): string =>
  createHmac('sha256', secreto)
    .update(`${marca}.${nonce}.${metodo.toUpperCase()} ${ruta}\n${cuerpo}`)
    .digest('hex');

/** Comparación en tiempo constante, también con longitudes distintas. */
export const coincide = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/** Nonces vistos dentro de la ventana. Más allá, la marca ya los rechaza. */
export class CacheDeNonces {
  private readonly vistos = new Map<string, number>();

  constructor(private readonly ventanaMs = VENTANA_LOCAL_S * 2000) {}

  /** `true` si el nonce es nuevo (y queda anotado); `false` si es una repetición. */
  usar(nonce: string, ahora: number): boolean {
    for (const [n, cuando] of this.vistos)
      if (ahora - cuando > this.ventanaMs) this.vistos.delete(n);
    if (this.vistos.has(nonce)) return false;
    this.vistos.set(nonce, ahora);
    return true;
  }
}

export interface SolicitudLocal {
  readonly marca: string | undefined;
  readonly nonce: string | undefined;
  readonly firma: string | undefined;
  readonly metodo: string;
  readonly ruta: string;
  readonly cuerpo: string;
}

export type RechazoLocal = 'sin_firma' | 'fuera_de_ventana' | 'firma' | 'repetida';

export const verificarLocal = (
  secreto: string,
  s: SolicitudLocal,
  ahora: number,
  nonces: CacheDeNonces,
): RechazoLocal | null => {
  if (s.marca === undefined || s.nonce === undefined || s.firma === undefined) return 'sin_firma';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(s.nonce)) return 'sin_firma';
  const segundos = Number(s.marca);
  if (!Number.isFinite(segundos) || Math.abs(ahora / 1000 - segundos) > VENTANA_LOCAL_S) {
    return 'fuera_de_ventana';
  }
  const esperada = firmaLocal(secreto, s.marca, s.nonce, s.metodo, s.ruta, s.cuerpo);
  if (!coincide(esperada, s.firma)) return 'firma';
  // El nonce se gasta DESPUÉS de comprobar la firma: un tercero no puede
  // «quemar» nonces ajenos con peticiones sin firma válida.
  return nonces.usar(s.nonce, ahora) ? null : 'repetida';
};

/** Ventana fija por minuto e IP. Responde cuánto esperar (para el `Retry-After`). */
export class LimitadorPorIp {
  private readonly cuentas = new Map<string, { minuto: number; n: number }>();

  constructor(private readonly porMinuto: number) {}

  admitir(ip: string, ahora: number): { readonly admitido: boolean; readonly esperaS: number } {
    const minuto = Math.floor(ahora / 60_000);
    const actual = this.cuentas.get(ip);
    const cuenta = actual === undefined || actual.minuto !== minuto ? { minuto, n: 0 } : actual;
    cuenta.n += 1;
    this.cuentas.set(ip, cuenta);
    if (this.cuentas.size > 10_000) this.cuentas.clear();
    return cuenta.n <= this.porMinuto
      ? { admitido: true, esperaS: 0 }
      : { admitido: false, esperaS: 60 - Math.floor((ahora % 60_000) / 1000) };
  }
}
