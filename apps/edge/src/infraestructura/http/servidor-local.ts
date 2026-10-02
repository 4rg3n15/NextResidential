/**
 * 15-Q · Q3/Q5 · LAS ENTRADAS LOCALES DEL EDGE
 *
 *  · `POST /alarm-server/<secreto>` — la cámara LPR publica aquí (además de a la
 *    nube): el sobre multipart lo abre `packages/providers`, el MISMO código de
 *    la API (`recibirPublicacionDeEquipo`), y el evento entra por la fuente.
 *  · `POST /hechos` — un hecho ya normalizado, firmado con el secreto local. Es
 *    la entrada de la ETAPA 12; ahora exige firma y nonce.
 *  · `GET  /estado` — el modo del enlace y la versión de reglas, firmado. Lo
 *    usa `pnpm sitio:edge`. Sin datos personales.
 *
 * Todo lo demás es 404. El servidor escucha en UNA interfaz (`EDGE_ESCUCHA_HOST`,
 * lo hace `main.ts`), limita el cuerpo y las peticiones por IP (Q5).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { recibirPublicacionDeEquipo } from '@ncr/providers';
import type { PublicacionDeEquipo } from '@ncr/providers';
import type { MetodoDeAcceso } from '@ncr/domain-core';
import type { HechoLocal } from '../../aplicacion/instantanea-de-reglas';
import type { DecisionLocal } from '../../aplicacion/puertos';
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  CABECERA_NONCE,
  CacheDeNonces,
  LimitadorPorIp,
  coincide,
  verificarLocal,
} from './proteccion-local';

/** El tope del sobre de una cámara: el mismo del analizador de `providers`. */
const SOBRE_MAXIMO_BYTES = 8 * 1024 * 1024;
const HECHO_MAXIMO_BYTES = 64 * 1024;
const METODOS: readonly MetodoDeAcceso[] = ['placa', 'facial', 'manual', 'remoto', 'tarjeta'];

export interface PuertasDelServidor {
  hecho(hecho: HechoLocal): DecisionLocal;
  estado(): Readonly<Record<string, unknown>>;
  publicar(publicacion: PublicacionDeEquipo): Promise<unknown>;
}

export interface CamaraDelEdge {
  readonly dispositivoId: string;
  readonly host: string;
  readonly secreto: string;
}

export interface OpcionesDelServidor {
  readonly secretoLocal: string;
  readonly limitePorMinuto: number;
  readonly camaras: readonly CamaraDelEdge[];
  readonly ahora?: () => number;
  readonly registrar?: (
    nivel: 'info' | 'aviso' | 'error',
    mensaje: string,
    contexto?: unknown,
  ) => void;
}

const responder = (
  res: ServerResponse,
  estado: number,
  cuerpo?: unknown,
  extra: Record<string, string> = {},
) => {
  res.writeHead(estado, { 'content-type': 'application/json', ...extra });
  res.end(cuerpo === undefined ? undefined : JSON.stringify(cuerpo));
};

const origen = (req: IncomingMessage): string =>
  (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');

/**
 * El cuerpo, o `null` si pasa del tope. Pasado el tope NO se acumula nada más
 * (la memoria queda acotada) pero se drena hasta el final, para poder contestar
 * 413 en vez de cortar la conexión a mitad: un emisor legítimo debe saber por qué.
 */
const leer = (req: IncomingMessage, tope: number): Promise<Buffer | null> =>
  new Promise((listo) => {
    const trozos: Buffer[] = [];
    let total = 0;
    req.on('data', (t: Buffer) => {
      total += t.length;
      if (total > tope) trozos.length = 0;
      else trozos.push(t);
    });
    req.on('end', () => listo(total > tope ? null : Buffer.concat(trozos)));
    req.on('error', () => listo(null));
  });

/** Forma mínima de un hecho: lo demás lo decide el motor, no este filtro. */
const hechoDesde = (x: unknown, ahora: number): HechoLocal | null => {
  if (x === null || typeof x !== 'object') return null;
  const h = x as Record<string, unknown>;
  const texto = (v: unknown, max: number): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= max;
  const opcional = (v: unknown): string | null =>
    typeof v === 'string' && v.length <= 128 ? v : null;
  if (!texto(h['dispositivoId'], 128) || !texto(h['referenciaExterna'], 128)) return null;
  if (!METODOS.includes(h['metodo'] as MetodoDeAcceso)) return null;
  const confianza = h['confianza'];
  if (typeof confianza !== 'number' || confianza < 0 || confianza > 1) return null;
  const ocurrido =
    typeof h['ocurridoEn'] === 'string' ? new Date(h['ocurridoEn']) : new Date(ahora);
  if (Number.isNaN(ocurrido.getTime())) return null;
  return {
    dispositivoId: h['dispositivoId'],
    metodo: h['metodo'] as MetodoDeAcceso,
    referenciaExterna: h['referenciaExterna'],
    confianza,
    placaLeida: opcional(h['placaLeida']),
    personaId: opcional(h['personaId']),
    zonaId: opcional(h['zonaId']),
    ocurridoEn: ocurrido,
  };
};

export const crearManejador = (puertas: PuertasDelServidor, opciones: OpcionesDelServidor) => {
  const nonces = new CacheDeNonces();
  const limitador = new LimitadorPorIp(opciones.limitePorMinuto);
  const reloj = opciones.ahora ?? Date.now;
  const negar = (res: ServerResponse, estado: number, motivo: string, req: IncomingMessage) => {
    opciones.registrar?.('aviso', 'entrada local rechazada', {
      motivo,
      origen: origen(req),
      ruta: req.url?.split('/')[1],
    });
    responder(res, estado);
  };

  /** El cuerpo, si la firma local es válida; `null` (y ya respondido) si no. */
  const firmada = async (
    req: IncomingMessage,
    res: ServerResponse,
    tope: number,
  ): Promise<string | null> => {
    const cuerpo = req.method === 'GET' ? Buffer.alloc(0) : await leer(req, tope);
    if (cuerpo === null) {
      negar(res, 413, 'cuerpo demasiado grande', req);
      return null;
    }
    const cab = (n: string) =>
      typeof req.headers[n] === 'string' ? (req.headers[n] as string) : undefined;
    const rechazo = verificarLocal(
      opciones.secretoLocal,
      {
        marca: cab(CABECERA_MARCA),
        nonce: cab(CABECERA_NONCE),
        firma: cab(CABECERA_FIRMA),
        metodo: req.method ?? '',
        ruta: req.url ?? '',
        cuerpo: cuerpo.toString('utf8'),
      },
      reloj(),
      nonces,
    );
    if (rechazo !== null) {
      negar(res, 401, rechazo, req);
      return null;
    }
    return cuerpo.toString('utf8');
  };

  const alarmServer = async (req: IncomingMessage, res: ServerResponse, secreto: string) => {
    const camara = opciones.camaras.find((c) => coincide(c.secreto, secreto));
    if (camara === undefined) return negar(res, 401, 'secreto de cámara desconocido', req);
    if (camara.host !== origen(req))
      return negar(res, 401, 'origen no declarado para la cámara', req);
    const cuerpo = await leer(req, SOBRE_MAXIMO_BYTES);
    if (cuerpo === null) return negar(res, 413, 'sobre demasiado grande', req);
    const recibido = recibirPublicacionDeEquipo(
      cuerpo,
      req.headers['content-type'],
      camara.dispositivoId,
      new Date(reloj()),
    );
    if (recibido.publicacion === null) return negar(res, 400, recibido.motivo, req);
    await puertas.publicar(recibido.publicacion);
    return responder(res, 200, { aceptado: true });
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const paso = limitador.admitir(origen(req), reloj());
      if (!paso.admitido)
        return responder(res, 429, undefined, { 'retry-after': String(paso.esperaS) });
      const ruta = (req.url ?? '').split('?')[0] ?? '';
      const camara = /^\/alarm-server\/([^/]{1,128})$/.exec(ruta);
      if (req.method === 'POST' && camara !== null)
        return await alarmServer(req, res, camara[1] ?? '');
      if (req.method === 'GET' && ruta === '/estado') {
        if ((await firmada(req, res, 0)) === null) return;
        return responder(res, 200, puertas.estado());
      }
      if (req.method === 'POST' && ruta === '/hechos') {
        const crudo = await firmada(req, res, HECHO_MAXIMO_BYTES);
        if (crudo === null) return;
        let hecho: HechoLocal | null = null;
        try {
          hecho = hechoDesde(JSON.parse(crudo), reloj());
        } catch {
          hecho = null;
        }
        // Ilegible → 400 y NO se decide: denegar ante un cuerpo roto (§2.1.4).
        if (hecho === null) return negar(res, 400, 'hecho ilegible', req);
        const d = puertas.hecho(hecho);
        return responder(res, 200, {
          permitido: d.resultado.permitido,
          motivo: d.resultado.permitido ? null : d.resultado.motivo,
          versionDeReglas: d.resultado.versionDeReglas.numero,
          porContingencia: d.porContingencia,
          requiereEscalamiento: d.requiereEscalamiento,
        });
      }
      return responder(res, 404);
    } catch (e) {
      opciones.registrar?.('error', 'entrada local fallida', {
        detalle: e instanceof Error ? e.message : String(e),
      });
      if (!res.headersSent) responder(res, 500);
    }
  };
};
