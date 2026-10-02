/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A2 · EL PROTOCOLO DEL TÚNEL EDGE ↔ API, VERSIÓN 1
 *
 * Un WebSocket, abierto SIEMPRE por el Edge (saliente: es lo único que cruza el
 * NAT del conjunto). Por él viajan dos clases de trama:
 *
 *  · TEXTO, un objeto JSON con `v` (versión) y `t` (tipo):
 *      hola        Edge → API   identidad: edge, marca, nonce y firma HMAC
 *      bienvenida  API → Edge   aceptado; la copropiedad que la API le reconoce
 *      pedido      ↔            una orden con `id`, `plazoMs`, `padre` y `clave`
 *      respuesta   ↔            su resultado tipado, o el error con su clase
 *      aviso       ↔            sin respuesta (una publicación, un estado)
 *      latido      ↔            sigo vivo
 *      canal       ↔            cierre de un canal binario
 *  · BINARIO, para el audio: [versión 1 B][canal u32][carga]. Los canales se
 *    multiplexan en el mismo WebSocket; cada lado numera los suyos con su
 *    paridad (el Edge impares, la API pares), así nunca chocan.
 *
 * Todo lo que no cumple esto cierra el túnel: un mensaje inválido no se
 * «interpreta lo mejor posible», porque quien lo envió no es quien dice ser o
 * está roto, y en los dos casos seguir hablando con él es peor.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { ProtocoloInvalido } from './errores-remotos';
import type { Transportable } from './serializacion';

export const VERSION_DEL_PROTOCOLO = 1;
/** Una publicación con foto y recorte (8 MiB en el Alarm Server) en base64. */
export const MENSAJE_MAXIMO_BYTES = 12 * 1024 * 1024;
/** Holgado para audio (5 tramas/s por sentido) y ráfagas de eventos en vivo. */
export const MENSAJES_POR_SEGUNDO = 400;
export const CABECERA_BINARIA_BYTES = 5;

export interface Hola {
  readonly v: 1;
  readonly t: 'hola';
  readonly edgeId: string;
  readonly marca: string;
  readonly nonce: string;
  readonly firma: string;
}
export interface Bienvenida {
  readonly v: 1;
  readonly t: 'bienvenida';
  readonly copropiedadId: string;
}
export interface Pedido {
  readonly v: 1;
  readonly t: 'pedido';
  readonly id: string;
  readonly nombre: string;
  readonly carga: Transportable;
  readonly plazoMs: number;
  /** El pedido que lo originó (una publicación): ver `contexto-de-pedido.ts`. */
  readonly padre?: string;
  readonly clave?: string;
}
export type Respuesta =
  | {
      readonly v: 1;
      readonly t: 'respuesta';
      readonly id: string;
      readonly ok: true;
      readonly valor: Transportable;
    }
  | {
      readonly v: 1;
      readonly t: 'respuesta';
      readonly id: string;
      readonly ok: false;
      readonly error: Transportable;
    };
export interface Aviso {
  readonly v: 1;
  readonly t: 'aviso';
  readonly nombre: string;
  readonly carga: Transportable;
}
export interface Latido {
  readonly v: 1;
  readonly t: 'latido';
}
export interface CierreDeCanal {
  readonly v: 1;
  readonly t: 'canal';
  readonly canal: number;
  readonly motivo: string;
}
export type Mensaje = Hola | Bienvenida | Pedido | Respuesta | Aviso | Latido | CierreDeCanal;

const NOMBRE = /^[a-zA-Z][a-zA-Z0-9.:_-]{0,63}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const texto = (o: Record<string, unknown>, campo: string, patron?: RegExp): string => {
  const v = o[campo];
  if (typeof v !== 'string' || (patron !== undefined && !patron.test(v))) {
    throw new ProtocoloInvalido(`campo «${campo}»`);
  }
  return v;
};

const opcional = (o: Record<string, unknown>, campo: string, patron: RegExp): string | undefined =>
  o[campo] === undefined ? undefined : texto(o, campo, patron);

/** Texto recibido → mensaje tipado, o `ProtocoloInvalido`. */
export const leerMensaje = (crudo: string): Mensaje => {
  if (crudo.length > MENSAJE_MAXIMO_BYTES) throw new ProtocoloInvalido('mensaje demasiado grande');
  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    throw new ProtocoloInvalido('no es JSON');
  }
  if (dato === null || typeof dato !== 'object' || Array.isArray(dato)) {
    throw new ProtocoloInvalido('no es un objeto');
  }
  const o = dato as Record<string, unknown>;
  if (o['v'] !== VERSION_DEL_PROTOCOLO) throw new ProtocoloInvalido(`versión ${String(o['v'])}`);
  switch (o['t']) {
    case 'hola':
      return {
        v: 1,
        t: 'hola',
        edgeId: texto(o, 'edgeId', /^[0-9a-f-]{36}$/i),
        marca: texto(o, 'marca', /^\d{1,12}$/),
        nonce: texto(o, 'nonce', /^[A-Za-z0-9_-]{16,64}$/),
        firma: texto(o, 'firma', /^[0-9a-f]{64}$/),
      };
    case 'bienvenida':
      return {
        v: 1,
        t: 'bienvenida',
        copropiedadId: texto(o, 'copropiedadId', /^[0-9a-f-]{36}$/i),
      };
    case 'pedido': {
      const plazoMs = o['plazoMs'];
      if (
        typeof plazoMs !== 'number' ||
        !Number.isInteger(plazoMs) ||
        plazoMs < 1 ||
        plazoMs > 600_000
      ) {
        throw new ProtocoloInvalido('plazo');
      }
      const padre = opcional(o, 'padre', ID);
      const clave = opcional(o, 'clave', /^[A-Za-z0-9_.:-]{1,200}$/);
      return {
        v: 1,
        t: 'pedido',
        id: texto(o, 'id', ID),
        nombre: texto(o, 'nombre', NOMBRE),
        carga: (o['carga'] ?? null) as Transportable,
        plazoMs,
        ...(padre === undefined ? {} : { padre }),
        ...(clave === undefined ? {} : { clave }),
      };
    }
    case 'respuesta': {
      const id = texto(o, 'id', ID);
      if (o['ok'] === true)
        return { v: 1, t: 'respuesta', id, ok: true, valor: (o['valor'] ?? null) as Transportable };
      if (o['ok'] === false)
        return {
          v: 1,
          t: 'respuesta',
          id,
          ok: false,
          error: (o['error'] ?? null) as Transportable,
        };
      throw new ProtocoloInvalido('respuesta sin «ok»');
    }
    case 'aviso':
      return {
        v: 1,
        t: 'aviso',
        nombre: texto(o, 'nombre', NOMBRE),
        carga: (o['carga'] ?? null) as Transportable,
      };
    case 'latido':
      return { v: 1, t: 'latido' };
    case 'canal': {
      const canal = o['canal'];
      if (
        typeof canal !== 'number' ||
        !Number.isInteger(canal) ||
        canal < 1 ||
        canal > 0xffffffff
      ) {
        throw new ProtocoloInvalido('canal');
      }
      return { v: 1, t: 'canal', canal, motivo: texto(o, 'motivo').slice(0, 200) };
    }
    default:
      throw new ProtocoloInvalido(`tipo «${String(o['t'])}»`);
  }
};

/** Una trama binaria de audio: cabecera fija de 5 bytes y la carga. */
export const tramaBinaria = (canal: number, carga: Uint8Array): Uint8Array => {
  const trama = new Uint8Array(CABECERA_BINARIA_BYTES + carga.byteLength);
  const vista = new DataView(trama.buffer);
  vista.setUint8(0, VERSION_DEL_PROTOCOLO);
  vista.setUint32(1, canal);
  trama.set(carga, CABECERA_BINARIA_BYTES);
  return trama;
};

export const leerTramaBinaria = (trama: Uint8Array): { canal: number; carga: Uint8Array } => {
  if (trama.byteLength < CABECERA_BINARIA_BYTES || trama.byteLength > MENSAJE_MAXIMO_BYTES) {
    throw new ProtocoloInvalido('trama binaria de tamaño inválido');
  }
  const vista = new DataView(trama.buffer, trama.byteOffset, trama.byteLength);
  if (vista.getUint8(0) !== VERSION_DEL_PROTOCOLO) throw new ProtocoloInvalido('versión binaria');
  const canal = vista.getUint32(1);
  if (canal === 0) throw new ProtocoloInvalido('canal 0');
  return { canal, carga: trama.subarray(CABECERA_BINARIA_BYTES) };
};
