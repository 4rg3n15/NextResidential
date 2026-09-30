import { Socket } from 'node:net';
import { cnonceAleatorio, construirAutorizacion } from '../barrera/digest';
import {
  causaDeRechazoRtsp,
  describirEnviado,
  describirOfrecidos,
  elegirDesafio,
  fraseDeRechazoRtsp,
} from './rtsp-desafios';
import type { CausaDeRechazoRtsp } from './rtsp-desafios';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D2 · C3 (ETAPA 15-L) · QUÉ VIDEO ENTREGA EL EQUIPO, PREGUNTÁNDOSELO
 *
 * El navegador reproduce H.264 y, en general, no H.265. Con un equipo en H.265
 * la consola quedaba en negro con «En vivo · primer cuadro pendiente», sin
 * decir por qué. Aquí se pregunta al equipo con un `DESCRIBE` de RTSP —la
 * misma puerta por la que el puente de video toma el flujo— y se lee el códec
 * del SDP que contesta (`a=rtpmap:96 H264/90000`, `H265/90000`: la forma que
 * trae la guía del fabricante en su ejemplo de RTSP).
 *
 * Reglas, las mismas del cliente HTTP:
 *  · Digest si el equipo lo ofrece, Basic si no; la credencial nunca va en la
 *    URL.
 *  · UN solo intento autenticado. Un 401 con la credencial ya enviada es la
 *    clave, y repetirla es como se bloquea la cuenta del equipo.
 *  · Plazo por respuesta; lo que no contesta es «inalcanzable», no un error.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ClaseDeRespuestaRtsp = 'respondio' | 'credencial' | 'rechazo' | 'inalcanzable';

export interface ResultadoRtsp {
  readonly clase: ClaseDeRespuestaRtsp;
  /** Código RTSP de la última respuesta, si la hubo. */
  readonly estado: number | null;
  /** «H.264», «H.265», «MJPEG» u otro, leído del SDP. `null` sin SDP. */
  readonly codec: string | null;
  readonly detalle: string;
  /** V3 (15-N) · con `rechazo`, qué significa el código (403, 404/412, 454…). */
  readonly causa?: CausaDeRechazoRtsp;
  /** V3 (15-N) · los desafíos que ofreció el equipo, sin nonce. */
  readonly ofrecido?: string;
  /** V3 (15-N) · el esquema y el usuario que se enviaron, sin la clave. */
  readonly enviado?: string;
}

export interface OpcionesRtsp {
  readonly host: string;
  readonly puerto: number;
  /** Ruta del flujo, p. ej. `/Streaming/Channels/102`. */
  readonly camino: string;
  readonly usuario: string;
  readonly clave: string;
  readonly tiempoLimiteMs?: number;
  /** Inyectable para pruebas. */
  readonly conectar?: (host: string, puerto: number) => Socket;
}

interface RespuestaRtsp {
  readonly estado: number;
  readonly cabeceras: ReadonlyMap<string, string>;
  /** V3 (15-N) · cada `WWW-Authenticate` por separado: unidas se mezclaban. */
  readonly desafios: readonly string[];
  readonly cuerpo: string;
}

/** El códec del flujo de VIDEO de un SDP. Pura. */
export const codecDelSdp = (sdp: string): string | null => {
  const lineas = sdp.split(/\r?\n/);
  const inicio = lineas.findIndex((l) => /^m=video\b/i.test(l));
  if (inicio < 0) return null;
  for (const linea of lineas.slice(inicio + 1)) {
    if (/^m=/i.test(linea)) break;
    const nombre = /^a=rtpmap:\d+\s+([A-Za-z0-9-]+)\//i.exec(linea)?.[1]?.toUpperCase();
    if (nombre === undefined) continue;
    if (nombre === 'H264') return 'H.264';
    if (nombre === 'H265' || nombre === 'HEVC') return 'H.265';
    if (nombre === 'JPEG' || nombre === 'MJPEG') return 'MJPEG';
    return nombre;
  }
  return null;
};

/** Una conexión RTSP: peticiones en orden, una respuesta por petición. */
const abrir = (opciones: OpcionesRtsp) => {
  const socket = (opciones.conectar ?? ((h, p) => new Socket().connect(p, h)))(
    opciones.host,
    opciones.puerto,
  );
  const plazo = opciones.tiempoLimiteMs ?? 5000;
  let bufer = Buffer.alloc(0);
  let fallo: Error | null = null;
  let esperando: {
    resolver: (r: RespuestaRtsp) => void;
    rechazar: (e: Error) => void;
  } | null = null;

  const intentar = (): void => {
    if (esperando === null) return;
    const fin = bufer.indexOf('\r\n\r\n');
    if (fin < 0) return;
    const cabeza = bufer.subarray(0, fin).toString('latin1').split('\r\n');
    const estado = Number(/^RTSP\/1\.\d\s+(\d{3})/.exec(cabeza[0] ?? '')?.[1] ?? '0');
    const cabeceras = new Map<string, string>();
    const desafios: string[] = [];
    for (const linea of cabeza.slice(1)) {
      const dos = linea.indexOf(':');
      if (dos < 0) continue;
      const nombre = linea.slice(0, dos).trim().toLowerCase();
      const valor = linea.slice(dos + 1).trim();
      if (nombre === 'www-authenticate') desafios.push(valor);
      cabeceras.set(nombre, cabeceras.has(nombre) ? `${cabeceras.get(nombre)}, ${valor}` : valor);
    }
    const largo = Number(cabeceras.get('content-length') ?? '0');
    if (bufer.length < fin + 4 + largo) return;
    const cuerpo = bufer.subarray(fin + 4, fin + 4 + largo).toString('utf8');
    bufer = bufer.subarray(fin + 4 + largo);
    const { resolver } = esperando;
    esperando = null;
    resolver({ estado, cabeceras, desafios, cuerpo });
  };

  socket.on('data', (d: Buffer) => {
    bufer = Buffer.concat([bufer, d]);
    intentar();
  });
  socket.on('error', (e: Error) => {
    fallo = e;
    esperando?.rechazar(e);
    esperando = null;
  });
  socket.on('close', () => {
    esperando?.rechazar(new Error('el equipo cerró la conexión RTSP'));
    esperando = null;
  });

  const pedir = (texto: string): Promise<RespuestaRtsp> =>
    new Promise((resolver, rechazar) => {
      if (fallo !== null) {
        rechazar(fallo);
        return;
      }
      const temporizador = setTimeout(() => {
        esperando = null;
        rechazar(new Error(`el equipo no contestó por RTSP en ${String(plazo)} ms`));
      }, plazo);
      esperando = {
        resolver: (r) => {
          clearTimeout(temporizador);
          resolver(r);
        },
        rechazar: (e) => {
          clearTimeout(temporizador);
          rechazar(e);
        },
      };
      socket.write(texto);
      intentar();
    });

  return { pedir, cerrar: () => socket.destroy() };
};

export const describirRtsp = async (opciones: OpcionesRtsp): Promise<ResultadoRtsp> => {
  const uri = `rtsp://${opciones.host}:${String(opciones.puerto)}${opciones.camino}`;
  const peticion = (cseq: number, autorizacion: string | null): string =>
    [
      `DESCRIBE ${uri} RTSP/1.0`,
      `CSeq: ${String(cseq)}`,
      'Accept: application/sdp',
      'User-Agent: NextControl',
      ...(autorizacion === null ? [] : [`Authorization: ${autorizacion}`]),
      '',
      '',
    ].join('\r\n');

  const conexion = abrir(opciones);
  try {
    let respuesta = await conexion.pedir(peticion(1, null));
    let ofrecido: string | undefined;
    let enviado: string | undefined;
    if (respuesta.estado === 401) {
      // V3 (15-N) · UN desafío elegido entre los ofrecidos (Digest MD5, SHA-256
      // o Basic), y el resumen que ese desafío pide.
      ofrecido = describirOfrecidos(respuesta.desafios);
      const elegido = elegirDesafio(respuesta.desafios) ?? { esquema: 'Basic', digest: null };
      enviado = describirEnviado(elegido, opciones.usuario);
      const credenciales = { usuario: opciones.usuario, clave: opciones.clave };
      const autorizacion =
        elegido.digest !== null
          ? construirAutorizacion(
              elegido.digest,
              credenciales,
              'DESCRIBE',
              uri,
              1,
              cnonceAleatorio(),
            )
          : `Basic ${Buffer.from(`${opciones.usuario}:${opciones.clave}`).toString('base64')}`;
      respuesta = await conexion.pedir(peticion(2, autorizacion));
      if (respuesta.estado === 401) {
        // E1-g (15-M) · fue un intercambio limpio (DESCRIBE sin credencial →
        // 401 → DESCRIBE autenticada), así que este 401 sí es la credencial.
        return {
          clase: 'credencial',
          estado: 401,
          codec: null,
          ofrecido,
          enviado,
          detalle:
            'el equipo rechazó la credencial por RTSP en un intercambio limpio (no se reintenta) · ' +
            `ofreció ${ofrecido} · se envió ${enviado}`,
        };
      }
    }
    const trazas = {
      ...(ofrecido === undefined ? {} : { ofrecido }),
      ...(enviado === undefined ? {} : { enviado }),
    };
    if (respuesta.estado !== 200) {
      return {
        clase: 'rechazo',
        estado: respuesta.estado,
        codec: null,
        causa: causaDeRechazoRtsp(respuesta.estado),
        ...trazas,
        detalle: fraseDeRechazoRtsp(respuesta.estado, opciones.camino),
      };
    }
    const codec = codecDelSdp(respuesta.cuerpo);
    return {
      clase: 'respondio',
      estado: 200,
      codec,
      ...trazas,
      detalle:
        codec === null
          ? 'el equipo describió el flujo, pero sin video legible en el SDP'
          : `el equipo describe ${opciones.camino} en ${codec}`,
    };
  } catch (error) {
    return {
      clase: 'inalcanzable',
      estado: null,
      codec: null,
      detalle: error instanceof Error ? error.message : 'sin respuesta RTSP',
    };
  } finally {
    conexion.cerrar();
  }
};
