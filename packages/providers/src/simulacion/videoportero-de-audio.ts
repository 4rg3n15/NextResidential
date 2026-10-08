import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';
import { ESPACIO, canalesDeAudio } from './documentos-del-simulado';
import type { CanalDeAudioSimulado } from './documentos-del-simulado';
import { DecodificadorTrozado } from '../videoportero/cuerpo-trozado';
import { DetectorDeMarcas, FuenteDeTramas } from './marcas-de-audio';
import { desafioDigest, digestValido, leerPeticion } from './rtsp-mensajes';
import type { PeticionRtsp } from './rtsp-mensajes';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P1 · EL VIDEOPORTERO SIMULADO EN RED, CON EL FLUJO TwoWayAudio DEL MANUAL
 *
 * El simulado de siempre (`equipo-simulado.ts`) sustituye a `fetch` dentro del
 * proceso: sirve para la lógica, no para medir un transporte. Éste escucha en
 * un puerto TCP y contesta como el manual «ISAPI IP Series / Ultra Series»:
 *
 *   GET channels/capabilities → GET channels → PUT …/open → GET …/audioData
 *   (persistente) → PUT …/audioData (persistente, sin Content-Length,
 *   application/octet-stream) → PUT …/close. Todo con Digest.
 *
 * · Un `open` con la sesión ya abierta —por otro cliente o por la nuestra—
 *   contesta 403 con `twoWayAudioInProgressPleaseWait` (0x40002068).
 * · Un canal DECLARADO abre aunque diga `enabled=false`: así abrió el
 *   DS-KD9633-WBE6 real (V2.3.9) el 06/10/2026 —`open` → 200 con sesión—, lo
 *   que desmiente el [SUPUESTO] S-176 (H-15S1-C07). Sólo un canal que el
 *   equipo NO declara contesta 403 `notSupport`.
 * · La subida se lee CRUDA, como la lee el equipo; si llega con
 *   `Transfer-Encoding: chunked` se decodifica y se APUNTA: un equipo real
 *   oiría las cabeceras de trozo como ruido, y la medida tiene que verlo.
 * · La bajada son tramas de 160 B cada 20 ms; `bajada.marcar()` mete un tono y
 *   apunta cuándo SALE. La subida pasa por un detector que apunta cuándo LLEGA
 *   uno. Mismo reloj en los dos extremos: la latencia es la resta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface GuionDeAudioEnRed {
  readonly usuario: string;
  readonly clave: string;
  readonly canales?: readonly CanalDeAudioSimulado[];
  /**
   * B7 (15-S2) · qué hace con `?sessionId=` en audioData y close: lo ignora
   * (por omisión), lo EXIGE (400 sin él) o lo RECHAZA (400 con él).
   */
  readonly sessionId?: 'ignorado' | 'exigido' | 'rechazado';
  /** B7 (15-S2) · semidúplex: mientras LLEGA audio (últimos 200 ms), la bajada calla. */
  readonly semiduplex?: boolean;
}

export interface EstadoDelVideoporteroEnRed {
  readonly sesionAbierta: boolean;
  readonly aperturas: number;
  readonly cierres: number;
  readonly ocupadoRespondido: number;
  readonly entramadoDeSubida: 'crudo' | 'chunked' | null;
  readonly bytesRecibidos: number;
  readonly subidasAbiertas: number;
  readonly bajadasAbiertas: number;
}

export interface VideoporteroDeAudioEnRed {
  readonly puerto: number;
  /** La bajada del equipo: la comparten `GET audioData` y la pista RTSP. */
  readonly bajada: FuenteDeTramas;
  readonly marcasRecibidas: readonly number[];
  /** Cuándo aceptó el equipo cada `PUT audioData`: el fin del establecimiento. */
  readonly subidasAceptadas: readonly number[];
  readonly peticiones: () => readonly string[];
  estado(): EstadoDelVideoporteroEnRed;
  /** Otro cliente abre el canal: el siguiente `open` recibe 0x40002068. */
  ocupar(): void;
  cerrar(): Promise<void>;
}

/** 0x40002068 en decimal, como lo escribe el equipo en `errorCode`. */
export const ERROR_CANAL_OCUPADO = 0x40002068;

const respuestaHttp = (estado: string, cuerpo = '', tipo = 'application/xml'): string =>
  `HTTP/1.1 ${estado}\r\nContent-Type: ${tipo}\r\nContent-Length: ${String(Buffer.byteLength(cuerpo))}\r\n\r\n${cuerpo}`;

const estadoIsapi = (ruta: string, codigo: number, cadena: string, sub: string, error?: number) =>
  `<?xml version="1.0" encoding="UTF-8"?><ResponseStatus version="2.0" xmlns="${ESPACIO}">` +
  `<requestURL>${ruta}</requestURL><statusCode>${String(codigo)}</statusCode>` +
  `<statusString>${cadena}</statusString><subStatusCode>${sub}</subStatusCode>` +
  (error === undefined ? '' : `<errorCode>${String(error)}</errorCode>`) +
  (error === ERROR_CANAL_OCUPADO
    ? '<errorMsg>Two-Way audio in progress...Please Wait.</errorMsg>'
    : '') +
  '</ResponseStatus>';

const CAPACIDADES =
  `<?xml version="1.0" encoding="UTF-8"?><TwoWayAudioChannel version="2.0" xmlns="${ESPACIO}">` +
  '<id>1</id><enabled opt="true,false"/><audioCompressionType opt="G.711ulaw"/>' +
  '<audioSamplingRate opt="8.00"/></TwoWayAudioChannel>';

export const videoporteroDeAudioEnRed = async (
  guion: GuionDeAudioEnRed,
): Promise<VideoporteroDeAudioEnRed> => {
  const canales = guion.canales ?? [{ id: 1, habilitado: true, codec: 'G.711ulaw' }];
  const nonce = randomBytes(8).toString('hex');
  const bajada = new FuenteDeTramas();
  const marcasRecibidas: number[] = [];
  const subidasAceptadas: number[] = [];
  const peticiones: string[] = [];
  const sockets = new Set<Socket>();
  const deAudio = new Set<Socket>();
  const detector = new DetectorDeMarcas((t) => marcasRecibidas.push(t));
  let sesion = false;
  let ultimaSubida = 0;
  const cuenta = { aperturas: 0, cierres: 0, ocupado: 0, bytes: 0, subidas: 0, bajadas: 0 };
  let entramado: 'crudo' | 'chunked' | null = null;

  const cerrarSesion = (): void => {
    sesion = false;
    for (const s of deAudio) s.end();
    deAudio.clear();
  };

  /** Atiende una petición ya autenticada. Devuelve el modo en que queda el socket. */
  const atender = (socket: Socket, p: PeticionRtsp): 'cabecera' | 'subida' | 'bajada' => {
    const ruta = p.uri.split('?')[0] ?? '';
    const audio = /^\/ISAPI\/System\/TwoWayAudio\/channels\/(\d+)\/(open|close|audioData)$/i.exec(
      ruta,
    );
    if (p.metodo === 'GET' && /\/TwoWayAudio\/channels\/capabilities$/i.test(ruta)) {
      socket.write(respuestaHttp('200 OK', CAPACIDADES));
    } else if (p.metodo === 'GET' && /\/TwoWayAudio\/channels$/i.test(ruta)) {
      socket.write(respuestaHttp('200 OK', canalesDeAudio(canales)));
    } else if (audio === null) {
      socket.write(
        respuestaHttp('403 Forbidden', estadoIsapi(ruta, 4, 'Invalid Operation', 'notSupport')),
      );
    } else if (canales.find((c) => String(c.id) === audio[1]) === undefined) {
      socket.write(
        respuestaHttp('403 Forbidden', estadoIsapi(ruta, 4, 'Invalid Operation', 'notSupport')),
      );
    } else if (
      audio[2] !== 'open' &&
      (guion.sessionId === 'exigido'
        ? !/[?&]sessionId=1(?:&|$)/.test(p.uri)
        : guion.sessionId === 'rechazado' && /[?&]sessionId=/.test(p.uri))
    ) {
      socket.write(
        respuestaHttp('400 Bad Request', estadoIsapi(ruta, 4, 'Invalid Content', 'badParameters')),
      );
    } else if (audio[2] === 'open' && p.metodo === 'PUT') {
      if (sesion) {
        cuenta.ocupado += 1;
        socket.write(
          respuestaHttp(
            '403 Forbidden',
            estadoIsapi(
              ruta,
              4,
              'Invalid Operation',
              'twoWayAudioInProgressPleaseWait',
              ERROR_CANAL_OCUPADO,
            ),
          ),
        );
      } else {
        sesion = true;
        cuenta.aperturas += 1;
        socket.write(
          respuestaHttp(
            '200 OK',
            `<TwoWayAudioSession version="2.0" xmlns="${ESPACIO}"><sessionId>1</sessionId></TwoWayAudioSession>`,
          ),
        );
      }
    } else if (audio[2] === 'close' && p.metodo === 'PUT') {
      cuenta.cierres += 1;
      cerrarSesion();
      socket.write(respuestaHttp('200 OK', estadoIsapi(ruta, 1, 'OK', 'ok')));
    } else if (!sesion) {
      socket.write(
        respuestaHttp(
          '403 Forbidden',
          estadoIsapi(ruta, 4, 'Invalid Operation', 'invalidOperation'),
        ),
      );
    } else if (p.metodo === 'GET') {
      cuenta.bajadas += 1;
      deAudio.add(socket);
      socket.write(
        'HTTP/1.1 200 OK\r\nConnection: keep-alive\r\nContent-Type: application/octet-stream\r\n\r\n',
      );
      const soltar = bajada.suscribir((trama) => {
        if (guion.semiduplex !== true || Date.now() - ultimaSubida > 200) socket.write(trama);
      });
      socket.once('close', soltar);
      return 'bajada';
    } else if (p.metodo === 'PUT') {
      cuenta.subidas += 1;
      deAudio.add(socket);
      entramado = /chunked/i.test(p.cabeceras.get('transfer-encoding') ?? '') ? 'chunked' : 'crudo';
      subidasAceptadas.push(Date.now());
      // Contesta en el acto y sigue leyendo: es lo que go2rtc espera (`tcp.Do`).
      socket.write('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n');
      return 'subida';
    }
    return 'cabecera';
  };

  const servidor: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
      deAudio.delete(socket);
    });
    socket.on('error', () => socket.destroy());
    let modo: 'cabecera' | 'subida' | 'bajada' = 'cabecera';
    let bufer = Buffer.alloc(0);
    let cuerpo: ((b: Buffer) => void) | null = null;
    socket.on('data', (d: Buffer) => {
      if (modo === 'subida') {
        cuerpo?.(d);
        return;
      }
      if (modo === 'bajada') return;
      bufer = Buffer.concat([bufer, d]);
      for (
        let fin = bufer.indexOf('\r\n\r\n');
        fin >= 0 && modo === 'cabecera';
        fin = bufer.indexOf('\r\n\r\n')
      ) {
        const p = leerPeticion(bufer.subarray(0, fin).toString('latin1'));
        const largo = Number(p?.cabeceras.get('content-length') ?? '0');
        if (bufer.length < fin + 4 + largo) return;
        const resto = bufer.subarray(fin + 4 + largo);
        bufer = Buffer.alloc(0);
        if (p === null) continue;
        peticiones.push(`${p.metodo} ${p.uri}`);
        const autorizacion = p.cabeceras.get('authorization');
        if (
          autorizacion === undefined ||
          !digestValido(autorizacion, p.metodo, nonce, guion.usuario, guion.clave, ['md5'])
        ) {
          socket.write(
            `HTTP/1.1 401 Unauthorized\r\n${desafioDigest(nonce, ['md5']).join('\r\n')}\r\nContent-Length: 0\r\n\r\n`,
          );
          // Sin autenticar, el cuerpo de un `audioData` no tiene forma conocida.
          if (/audioData/i.test(p.uri)) socket.end();
          bufer = resto;
          continue;
        }
        modo = atender(socket, p);
        if (modo === 'subida') {
          const llega = (b: Buffer): void => {
            cuenta.bytes += b.length;
            ultimaSubida = Date.now();
            detector.alimentar(b);
          };
          const trozado = new DecodificadorTrozado(llega);
          cuerpo = entramado === 'chunked' ? (b) => trozado.alimentar(b) : llega;
          if (resto.length > 0) cuerpo(resto);
          return;
        }
        bufer = resto;
      }
    });
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  return {
    puerto: (servidor.address() as AddressInfo).port,
    bajada,
    marcasRecibidas,
    subidasAceptadas,
    peticiones: () => [...peticiones],
    estado: () => ({
      sesionAbierta: sesion,
      aperturas: cuenta.aperturas,
      cierres: cuenta.cierres,
      ocupadoRespondido: cuenta.ocupado,
      entramadoDeSubida: entramado,
      bytesRecibidos: cuenta.bytes,
      subidasAbiertas: cuenta.subidas,
      bajadasAbiertas: cuenta.bajadas,
    }),
    ocupar: () => {
      sesion = true;
    },
    cerrar: () =>
      new Promise<void>((listo) => {
        bajada.detener();
        for (const s of sockets) s.destroy();
        servidor.close(() => listo());
      }),
  };
};
