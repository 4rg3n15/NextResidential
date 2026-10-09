/**
 * Un LECTOR LENTO para la salida de un proceso · 15-S2 · H-15S2-09.
 *
 * Node escribe la salida estándar en un socket o tubería NO bloqueante: lo que
 * no cabe se encola y sólo sale cuando el bucle de eventos gira. Un guion que
 * termina con `process.exit` tira esa cola. Con un lector rápido no se ve; con
 * uno que se retrasa —un verificador cargado, la cobertura de V8 escribiendo—
 * la salida llega cortada, y el corte no deja rastro: el código de salida es el
 * mismo. Así falló la sonda D-100 en la 15-K y dos veces en la 15-S2.
 *
 * Aquí el lector se retrasa A PROPÓSITO, y de forma determinista: el proceso
 * escribe en un socket de UNIX que nadie lee hasta que el proceso termina o
 * pasan `esperaMs`. Lo que llegue entonces es lo que habría recibido el peor
 * lector posible.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const evento = (emisor, nombre) => new Promise((r) => emisor.once(nombre, r));

/** @returns {Promise<{ codigo: number | null, salida: string, terminoSinLector: boolean }>} */
export const conLectorLento = async (comando, args, { cwd, env, esperaMs }) => {
  const dir = mkdtempSync(join(tmpdir(), 'ncr-lector-lento-'));
  const servidor = createServer({ pauseOnConnect: true });
  try {
    servidor.listen(join(dir, 'salida.sock'));
    await evento(servidor, 'listening');
    const aceptada = evento(servidor, 'connection');
    const escritor = connect(join(dir, 'salida.sock'));
    await evento(escritor, 'connect');
    const lector = await aceptada;

    const hijo = spawn(comando, args, { cwd, env, stdio: ['ignore', escritor, 'ignore'] });
    // El hijo tiene su copia del descriptor; la nuestra impediría el fin de fichero.
    escritor.destroy();
    const salio = evento(hijo, 'exit');

    let plazo;
    const terminoSinLector = await Promise.race([
      salio.then(() => true),
      new Promise((r) => (plazo = setTimeout(r, esperaMs, false))),
    ]);
    clearTimeout(plazo);

    const trozos = [];
    lector.on('data', (t) => trozos.push(t));
    const fin = evento(lector, 'end');
    lector.resume();
    await Promise.all([fin, salio]);
    return {
      codigo: hijo.exitCode,
      salida: Buffer.concat(trozos).toString('utf8'),
      terminoSinLector,
    };
  } finally {
    servidor.close();
    rmSync(dir, { recursive: true, force: true });
  }
};
