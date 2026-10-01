#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H6 (ETAPA 15-L) · LA CONSOLA, ARRANCADA POR NOSOTROS: LA IP DEL CLIENTE ES
 * LA DE SU SOCKET
 *
 * `next start` conserva la `X-Forwarded-For` que mande el NAVEGADOR (en
 * `base-server.js` la fija con `??=`: sólo si no viene). Como nadie va delante
 * de la consola en sitio, esa cabecera la escribiría el propio cliente: un
 * portero podría declararse desde la IP de la portería o desde la del
 * superadministrador y la lista blanca de guardia remota no serviría de nada.
 *
 * Este arranque hace lo mismo que `next start` y una cosa más: antes de que
 * Next vea la petición, SUSTITUYE `X-Forwarded-For` por la dirección del
 * socket. El proxy `/api/ncr` la reenvía a la API, que sólo la cree porque la
 * petición le llega del proxy propio (trust proxy acotado, `API_PROXIES_DE_CONFIANZA`).
 *
 *   node servidor.mjs [-p 3100] [-H 0.0.0.0] [--dev]
 *
 * 15-P · y reenvía el WebSocket del audio de la guardia (`/api/ncr-audio`) a
 * la API (`API_URL` + `/guardia/audio`), por el MISMO origen de la consola: la
 * CSP no se relaja (`connect-src 'self'` lo cubre) y el navegador nunca ve la
 * API. Se reenvía el billete y nada más —ni cookies ni cabeceras del
 * navegador salvo las del protocolo—, con la IP del socket en
 * `X-Forwarded-For`, igual que el proxy `/api/ncr`. Con `--dev` arranca Next
 * en desarrollo (`pnpm dev`) con el mismo reenvío; el resto de
 * actualizaciones (la recarga en caliente) siguen yendo a Next.
 *
 * Con un proxy de confianza DELANTE de la consola (un balanceador), su
 * dirección va en `CONSOLA_PROXIES_DE_CONFIANZA` (coma): de ésos, y sólo de
 * ésos, se conserva la primera IP de la cabecera que traigan.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createServer } from 'node:http';
import { reenviarAudio, RUTA_DEL_AUDIO_EN_LA_CONSOLA } from './reenvio-de-audio.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { ipDelCliente, proxiesDeConfianza } from './ip-del-cliente.mjs';

const args = process.argv.slice(2);
const opcion = (corta, larga, porOmision) => {
  const i = args.findIndex((a) => a === corta || a === larga);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : porOmision;
};
const puerto = Number(opcion('-p', '--port', '3100'));
const anfitrion = opcion('-H', '--hostname', '0.0.0.0');
const deConfianza = proxiesDeConfianza(process.env.CONSOLA_PROXIES_DE_CONFIANZA);

const app = next({
  dev: args.includes('--dev'),
  dir: dirname(fileURLToPath(import.meta.url)),
  hostname: anfitrion,
  port: puerto,
});
await app.prepare();
const manejar = app.getRequestHandler();

const actualizarEnNext = app.getUpgradeHandler();
const servidor = createServer((peticion, respuesta) => {
  peticion.headers['x-forwarded-for'] = ipDelCliente(
    peticion.socket.remoteAddress,
    peticion.headers['x-forwarded-for'],
    deConfianza,
  );
  void manejar(peticion, respuesta);
});
servidor.on('upgrade', (peticion, socket, cabeza) => {
  const ip = ipDelCliente(
    peticion.socket.remoteAddress,
    peticion.headers['x-forwarded-for'],
    deConfianza,
  );
  if ((peticion.url ?? '').split('?')[0] === RUTA_DEL_AUDIO_EN_LA_CONSOLA) {
    reenviarAudio(peticion, socket, cabeza, { apiUrl: process.env.API_URL ?? '', ip });
    return;
  }
  peticion.headers['x-forwarded-for'] = ip;
  void actualizarEnNext(peticion, socket, cabeza);
});
servidor.listen(puerto, anfitrion, () => {
  console.log(`▲ consola en http://${anfitrion}:${String(puerto)} (IP del cliente: la del socket)`);
});
