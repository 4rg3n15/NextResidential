import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';
import {
  REQUIRE_BACKCHANNEL,
  canalDeLaUri,
  desafioDigest,
  digestValido,
  leerPeticion,
  respuestaRtsp,
  sdpDe,
  transporteDeRespuesta,
} from './rtsp-mensajes';
import type { DesafioSimulado, PeticionRtsp } from './rtsp-mensajes';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D2 (ETAPA 15-L) · E2/C1 (15-M) · UN EQUIPO QUE CONTESTA POR RTSP
 *
 * Escucha en el bucle local y contesta como el equipo: `DESCRIBE` con el
 * desafío Digest (y Basic, como ofrecen estos aparatos) y después el SDP del
 * canal pedido con el códec que diga el guion; un canal que no tiene, 404; una
 * credencial mala, 401 otra vez. Cuenta las peticiones: la prueba de que el
 * cliente no reintenta una clave rechazada se mira aquí.
 *
 * E2/C1 · además atiende `OPTIONS`, `SETUP`, `PLAY`, `GET_PARAMETER` y
 * `TEARDOWN`, lo mínimo para que el PUENTE DE VIDEO (go2rtc) complete una
 * negociación WebRTC contra él sin equipo. Y reproduce el fallo visto en
 * sitio (28/09, «HTTP 500 · EOF»): con `cerrarSiPideBackchannel`, un
 * `DESCRIBE` que traiga `Require: www.onvif.org/ver20/backchannel` —lo que el
 * puente manda por omisión— cierra la conexión sin contestar, como hace el
 * equipo. Medido con el binario real: el puente REINTENTA una vez sin el
 * canal de retorno en una conexión nueva, así que el EOF sólo llega si el
 * equipo rechaza también esa reconexión inmediata (`rechazaReconexionMs`,
 * [SUPUESTO] S-110: la terminal, de una sola sesión RTSP, lo hace). La
 * corrección (`#backchannel=0` en la fuente) evita la primera conexión
 * cerrada y con ella el reintento: se demuestra aquí.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface GuionRtsp {
  readonly usuario: string;
  readonly clave: string;
  /** Canal → códec del SDP, p. ej. `{ '102': 'H264', '101': 'H265' }`. */
  readonly canales: Readonly<Record<string, string>>;
  /** E2 · corta la conexión si el DESCRIBE pide el canal de retorno ONVIF. */
  readonly cerrarSiPideBackchannel?: boolean;
  /** E2 · tras ese corte, cierra también toda conexión nueva durante estos ms. */
  readonly rechazaReconexionMs?: number;
  /** V3 (15-N) · los desafíos del 401, en orden. Por omisión Digest (MD5) y Basic. */
  readonly desafios?: readonly DesafioSimulado[];
  /** V3 (15-N) · qué contesta a un canal que no tiene (por omisión `404 Not Found`). */
  readonly estadoSinCanal?: string;
  /** V3 (15-N) · respuesta fija por canal, ya autenticado (p. ej. `403 Forbidden`). */
  readonly estadosPorCanal?: Readonly<Record<string, string>>;
}

export interface ServidorRtspSimulado {
  readonly puerto: number;
  readonly peticiones: () => number;
  /** E2 · cuántos DESCRIBE llegaron pidiendo el canal de retorno. */
  readonly describesConBackchannel: () => number;
  /** E2 · qué métodos llegaron, en orden: la prueba de que el puente negoció. */
  readonly metodos: () => readonly string[];
  cerrar(): Promise<void>;
}

const SESION = 'ncr-sim-1';

export const servidorRtspSimulado = async (guion: GuionRtsp): Promise<ServidorRtspSimulado> => {
  let peticiones = 0;
  let conBackchannel = 0;
  const metodos: string[] = [];
  const nonce = randomBytes(8).toString('hex');
  const sockets = new Set<Socket>();
  let rechazaHasta = 0;

  const atender = (socket: Socket, p: PeticionRtsp): void => {
    const responder = (estado: string, extra: readonly string[] = [], cuerpo = ''): void => {
      socket.write(respuestaRtsp(p.cseq, estado, extra, cuerpo));
    };
    const autorizacion = p.cabeceras.get('authorization');
    const autenticado =
      autorizacion !== undefined &&
      digestValido(autorizacion, p.metodo, nonce, guion.usuario, guion.clave, guion.desafios);

    if (p.metodo === 'OPTIONS') {
      responder('200 OK', ['Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN, GET_PARAMETER']);
      return;
    }
    if (p.metodo === 'DESCRIBE') {
      if ((p.cabeceras.get('require') ?? '').includes(REQUIRE_BACKCHANNEL)) {
        conBackchannel += 1;
        if (guion.cerrarSiPideBackchannel === true) {
          rechazaHasta = Date.now() + (guion.rechazaReconexionMs ?? 0);
          // FIN, no RST: el puente lee «EOF», que es lo que se vio en sitio.
          socket.end();
          return;
        }
      }
      if (!autenticado) {
        responder('401 Unauthorized', desafioDigest(nonce, guion.desafios));
        return;
      }
      const canal = canalDeLaUri(p.uri) ?? '';
      const fijo = guion.estadosPorCanal?.[canal];
      if (fijo !== undefined) {
        responder(fijo);
        return;
      }
      const codec = guion.canales[canal];
      if (codec === undefined) {
        responder(guion.estadoSinCanal ?? '404 Not Found');
        return;
      }
      responder(
        '200 OK',
        ['Content-Type: application/sdp', `Content-Base: ${p.uri.replace(/\/?$/, '/')}`],
        sdpDe(codec),
      );
      return;
    }
    if (p.metodo === 'SETUP') {
      responder('200 OK', [
        `Transport: ${transporteDeRespuesta(p.cabeceras.get('transport'))}`,
        `Session: ${SESION};timeout=60`,
      ]);
      return;
    }
    if (p.metodo === 'PLAY') {
      responder('200 OK', [`Session: ${SESION}`, 'Range: npt=0.000-']);
      return;
    }
    if (p.metodo === 'GET_PARAMETER' || p.metodo === 'TEARDOWN') {
      responder('200 OK', [`Session: ${SESION}`]);
      return;
    }
    responder('405 Method Not Allowed');
  };

  const servidor: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    if (Date.now() < rechazaHasta) {
      socket.end();
      return;
    }
    let bufer = '';
    socket.on('data', (d: Buffer) => {
      bufer += d.toString('latin1');
      for (let fin = bufer.indexOf('\r\n\r\n'); fin >= 0; fin = bufer.indexOf('\r\n\r\n')) {
        const cabecera = bufer.slice(0, fin);
        bufer = bufer.slice(fin + 4);
        const p = leerPeticion(cabecera);
        if (p === null) continue;
        // Un cuerpo (Content-Length) se descarta: ninguna petición atendida lo usa.
        const largo = Number(p.cabeceras.get('content-length') ?? '0');
        if (largo > 0) bufer = bufer.slice(largo);
        peticiones += 1;
        metodos.push(p.metodo);
        atender(socket, p);
        if (socket.destroyed || socket.writableEnded) return;
      }
    });
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  return {
    puerto: (servidor.address() as AddressInfo).port,
    peticiones: () => peticiones,
    describesConBackchannel: () => conBackchannel,
    metodos: () => [...metodos],
    cerrar: () =>
      new Promise<void>((listo) => {
        for (const s of sockets) s.destroy();
        servidor.close(() => listo());
      }),
  };
};
