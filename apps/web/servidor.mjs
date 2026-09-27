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
 *   node servidor.mjs [-p 3100] [-H 0.0.0.0]
 *
 * Con un proxy de confianza DELANTE de la consola (un balanceador), su
 * dirección va en `CONSOLA_PROXIES_DE_CONFIANZA` (coma): de ésos, y sólo de
 * ésos, se conserva la primera IP de la cabecera que traigan.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createServer } from 'node:http';
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
  dev: false,
  dir: dirname(fileURLToPath(import.meta.url)),
  hostname: anfitrion,
  port: puerto,
});
await app.prepare();
const manejar = app.getRequestHandler();

createServer((peticion, respuesta) => {
  peticion.headers['x-forwarded-for'] = ipDelCliente(
    peticion.socket.remoteAddress,
    peticion.headers['x-forwarded-for'],
    deConfianza,
  );
  void manejar(peticion, respuesta);
}).listen(puerto, anfitrion, () => {
  console.log(`▲ consola en http://${anfitrion}:${String(puerto)} (IP del cliente: la del socket)`);
});
