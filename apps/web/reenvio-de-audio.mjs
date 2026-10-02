/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · EL WEBSOCKET DEL AUDIO, DE LA CONSOLA A LA API, SIN TOCARLO
 *
 * `servidor.mjs` llama aquí con cada actualización a `/api/ncr-audio`. Se abre
 * la misma actualización contra la API (`API_URL` + `/guardia/audio`) y, si la
 * API la acepta (101), los dos sockets se empalman byte a byte: la consola no
 * interpreta ni guarda nada del audio.
 *
 * Lo que pasa a la API, y nada más: el billete de la consulta, las cabeceras
 * del protocolo WebSocket y la IP del navegador. Ni cookies ni el resto de
 * cabeceras: el billete ya es la autorización, y lo demás no le hace falta.
 * Si la API rechaza (401 billete gastado, 404), el navegador recibe el mismo
 * código y el socket se cierra.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { request as pedirHttp } from 'node:http';
import { request as pedirHttps } from 'node:https';

export const RUTA_DEL_AUDIO_EN_LA_CONSOLA = '/api/ncr-audio';
const RUTA_DEL_AUDIO_EN_LA_API = '/guardia/audio';
const DEL_PROTOCOLO = ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions'];
const DE_VUELTA = ['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-extensions'];

const contestar = (socket, estado, texto) => {
  socket.write(
    `HTTP/1.1 ${String(estado)} ${texto}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
};

export const reenviarAudio = (peticion, socket, cabeza, { apiUrl, ip }) => {
  let destino;
  try {
    destino = new URL(RUTA_DEL_AUDIO_EN_LA_API, apiUrl);
  } catch {
    contestar(socket, 502, 'Bad Gateway');
    return;
  }
  const billete = new URL(peticion.url ?? '/', 'http://consola').searchParams.get('billete') ?? '';
  destino.searchParams.set('billete', billete);
  const cabeceras = { connection: 'Upgrade', upgrade: 'websocket', 'x-forwarded-for': ip };
  for (const nombre of DEL_PROTOCOLO) {
    const valor = peticion.headers[nombre];
    if (typeof valor === 'string') cabeceras[nombre] = valor;
  }
  const pedir = destino.protocol === 'https:' ? pedirHttps : pedirHttp;
  const haciaLaApi = pedir(destino, { method: 'GET', headers: cabeceras });
  haciaLaApi.on('upgrade', (respuesta, socketApi, cabezaApi) => {
    const lineas = ['HTTP/1.1 101 Switching Protocols'];
    for (const nombre of DE_VUELTA) {
      const valor = respuesta.headers[nombre];
      if (typeof valor === 'string') lineas.push(`${nombre}: ${valor}`);
    }
    socket.write(`${lineas.join('\r\n')}\r\n\r\n`);
    if (cabezaApi.length > 0) socket.write(cabezaApi);
    if (cabeza.length > 0) socketApi.write(cabeza);
    socketApi.setNoDelay(true);
    socket.setNoDelay?.(true);
    socket.pipe(socketApi).pipe(socket);
    const cerrarAmbos = () => {
      socket.destroy();
      socketApi.destroy();
    };
    socket.on('error', cerrarAmbos);
    socketApi.on('error', cerrarAmbos);
    socket.on('close', cerrarAmbos);
    socketApi.on('close', cerrarAmbos);
  });
  haciaLaApi.on('response', (respuesta) => {
    contestar(socket, respuesta.statusCode ?? 502, respuesta.statusMessage ?? 'Bad Gateway');
    respuesta.resume();
  });
  haciaLaApi.on('error', () => contestar(socket, 502, 'Bad Gateway'));
  socket.on('error', () => haciaLaApi.destroy());
  haciaLaApi.end();
};
