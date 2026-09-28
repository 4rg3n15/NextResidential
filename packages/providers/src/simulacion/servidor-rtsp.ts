import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D2 (ETAPA 15-L) · UN EQUIPO QUE CONTESTA POR RTSP, PARA LAS PRUEBAS
 *
 * Escucha en el bucle local y contesta `DESCRIBE` como el equipo: primero el
 * desafío Digest (y Basic, como ofrecen estos aparatos), después el SDP del
 * canal pedido con el códec que diga el guion. Un canal que no tiene, 404; una
 * credencial mala, 401 otra vez. Cuenta las peticiones: la prueba de que el
 * cliente no reintenta una clave rechazada se mira aquí.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface GuionRtsp {
  readonly usuario: string;
  readonly clave: string;
  /** Canal → códec del SDP, p. ej. `{ '102': 'H264', '101': 'H265' }`. */
  readonly canales: Readonly<Record<string, string>>;
}

export interface ServidorRtspSimulado {
  readonly puerto: number;
  readonly peticiones: () => number;
  cerrar(): Promise<void>;
}

const md5 = (t: string): string => createHash('md5').update(t, 'utf8').digest('hex');
const REINO = 'IP Camera(simulada)';

const sdp = (codec: string): string =>
  [
    'v=0',
    'o=- 1 1 IN IP4 0.0.0.0',
    's=Media Presentation',
    't=0 0',
    'm=video 0 RTP/AVP 96',
    `a=rtpmap:96 ${codec}/90000`,
    'a=control:trackID=video',
    'm=audio 0 RTP/AVP 0',
    'a=rtpmap:0 PCMU/8000',
    '',
  ].join('\r\n');

export const servidorRtspSimulado = async (guion: GuionRtsp): Promise<ServidorRtspSimulado> => {
  let peticiones = 0;
  const nonce = randomBytes(8).toString('hex');
  const servidor: Server = createServer((socket) => {
    let bufer = '';
    socket.on('data', (d: Buffer) => {
      bufer += d.toString('latin1');
      for (let fin = bufer.indexOf('\r\n\r\n'); fin >= 0; fin = bufer.indexOf('\r\n\r\n')) {
        const lineas = bufer.slice(0, fin).split('\r\n');
        bufer = bufer.slice(fin + 4);
        peticiones += 1;
        const [metodo, uri] = (lineas[0] ?? '').split(' ');
        const cseq =
          lineas
            .find((l) => /^cseq:/i.test(l))
            ?.split(':')[1]
            ?.trim() ?? '0';
        const autorizacion = lineas.find((l) => /^authorization:/i.test(l));
        const responder = (estado: string, extra: readonly string[] = [], cuerpo = ''): void => {
          socket.write(
            [
              `RTSP/1.0 ${estado}`,
              `CSeq: ${cseq}`,
              ...extra,
              `Content-Length: ${String(Buffer.byteLength(cuerpo))}`,
              '',
              cuerpo,
            ].join('\r\n'),
          );
        };
        const desafio = (): void =>
          responder('401 Unauthorized', [
            `WWW-Authenticate: Digest realm="${REINO}", nonce="${nonce}", stale="FALSE"`,
            `WWW-Authenticate: Basic realm="${REINO}"`,
          ]);
        if (metodo !== 'DESCRIBE' || uri === undefined) {
          responder('405 Method Not Allowed');
          continue;
        }
        if (autorizacion === undefined) {
          desafio();
          continue;
        }
        const campo = (n: string): string =>
          new RegExp(`${n}="?([^",]+)"?`, 'i').exec(autorizacion)?.[1] ?? '';
        const ha1 = md5(`${guion.usuario}:${REINO}:${guion.clave}`);
        const esperado = md5(`${ha1}:${nonce}:${md5(`DESCRIBE:${campo('uri')}`)}`);
        if (campo('username') !== guion.usuario || campo('response') !== esperado) {
          desafio();
          continue;
        }
        const canal = /\/Streaming\/Channels\/(\d+)$/i.exec(uri)?.[1] ?? '';
        const codec = guion.canales[canal];
        if (codec === undefined) {
          responder('404 Not Found');
          continue;
        }
        responder('200 OK', ['Content-Type: application/sdp'], sdp(codec));
      }
    });
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  return {
    puerto: (servidor.address() as AddressInfo).port,
    peticiones: () => peticiones,
    cerrar: () =>
      new Promise<void>((listo) => {
        servidor.close(() => listo());
      }),
  };
};
