// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  esCancelacionDelCliente,
  filtrarCancelacionesDelCliente,
} from '../../cancelaciones-del-cliente.mjs';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D1 (15-S1) · «⨯ uncaughtException: [Error: aborted] { code: 'ECONNRESET' }»
 *
 * Lo imprimía la consola en sitio cada vez que el navegador cancelaba un
 * `POST …/whep` al cambiar de equipo. La RÉPLICA corre en un proceso aparte
 * —una excepción no capturada dentro de vitest tumbaría la suite— con la
 * función REAL de Next (`getCloneableBody`) en el orden de `next-server.js`
 * para un middleware `nodejs`, como el de la consola. Sin el filtro reproduce
 * la línea de sitio; con él desaparece, y otro fallo cualquiera sigue llegando.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const WEB = fileURLToPath(new URL('../../', import.meta.url));
const FILTRO = new URL('../../cancelaciones-del-cliente.mjs', import.meta.url).href;

const REPLICA = `
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
const [paquete, filtro, conFiltro] = process.argv.slice(1);
const { getCloneableBody } = createRequire(paquete)('next/dist/server/body-streams.js');
// Lo que hace router-server.js de Next: imprimir toda excepción no capturada.
process.on('uncaughtException', (e) => console.log('uncaughtException:', e.message, e.code ?? ''));
if (conFiltro === 'si') (await import(filtro)).filtrarCancelacionesDelCliente();
let cliente;
const consola = createServer(async (req, res) => {
  const cuerpo = getCloneableBody(req);
  cuerpo.cloneBodyStream();  // el middleware recibe una copia y no la lee
  void cuerpo.finalize();    // next-server.js la llama sin await
  for await (const trozo of req) void trozo; // el manejador consume la oferta SDP
  res.on('close', () => setTimeout(() => {
    setTimeout(() => { throw new Error('otro fallo'); });
    setTimeout(() => { console.log('fin'); process.exit(0); }, 20);
  }, 20));
  cliente.destroy();         // el operador cambia de equipo mientras se negocia
});
consola.listen(0, '127.0.0.1', () => {
  cliente = request({ host: '127.0.0.1', port: consola.address().port, method: 'POST',
    path: '/api/ncr/guardia/video/camara/whep',
    headers: { 'content-type': 'application/sdp', 'content-length': '5' } });
  cliente.on('error', () => {});
  cliente.end('v=0\\r\\n');
});
`;

const replica = (conFiltro: boolean): Promise<string> =>
  new Promise((resolver, rechazar) => {
    execFile(
      process.execPath,
      ['--input-type=module', '-e', REPLICA, `${WEB}package.json`, FILTRO, conFiltro ? 'si' : 'no'],
      { timeout: 20_000 },
      (error, salida) => (error === null ? resolver(salida) : rechazar(error)),
    );
  });

const cancelacion = (): Error => Object.assign(new Error('aborted'), { code: 'ECONNRESET' });

describe('D1 (15-S1) · la cancelación del navegador, en la consola', () => {
  it('la réplica reproduce lo de sitio: sin filtro, la cancelación llega como no capturada', async () => {
    const salida = await replica(false);
    // Si esto deja de cumplirse, Next cambió el clonado del cuerpo: revisar si
    // el filtro sigue haciendo falta, no relajar la prueba.
    expect(salida).toContain('uncaughtException: aborted ECONNRESET');
    expect(salida).toContain('uncaughtException: otro fallo');
    expect(salida).toContain('fin');
  });

  it('con el filtro, la cancelación desaparece y cualquier otro fallo llega intacto', async () => {
    const salida = await replica(true);
    expect(salida).not.toContain('aborted');
    expect(salida).toContain('uncaughtException: otro fallo');
    expect(salida).toContain('fin');
  });

  it('la firma es exacta: «aborted» Y ECONNRESET, nada más', () => {
    expect(esCancelacionDelCliente(cancelacion())).toBe(true);
    expect(esCancelacionDelCliente(new Error('aborted'))).toBe(false);
    expect(
      esCancelacionDelCliente(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })),
    ).toBe(false);
    expect(esCancelacionDelCliente({ message: 'aborted', code: 'ECONNRESET' })).toBe(false);
  });

  it('entrega lo demás a los oyentes previos, en orden y con el origen', () => {
    const proceso = new EventEmitter();
    const vistos: string[] = [];
    proceso.on('uncaughtException', (e: Error, origen: string) =>
      vistos.push(`a:${e.message}:${origen}`),
    );
    proceso.on('uncaughtException', (e: Error) => vistos.push(`b:${e.message}`));
    expect(filtrarCancelacionesDelCliente(proceso)).toBe(true);
    proceso.emit('uncaughtException', cancelacion(), 'uncaughtException');
    proceso.emit('uncaughtException', new Error('fallo'), 'uncaughtException');
    expect(vistos).toEqual(['a:fallo:uncaughtException', 'b:fallo']);
  });

  it('sin oyentes previos no se pone: un fallo de verdad sigue terminando el proceso', () => {
    const proceso = new EventEmitter();
    expect(filtrarCancelacionesDelCliente(proceso)).toBe(false);
    expect(proceso.listenerCount('uncaughtException')).toBe(0);
  });

  it('servidor.mjs lo pone DESPUÉS de app.prepare(), que es cuando Next registra los suyos', () => {
    const servidor = readFileSync(`${WEB}servidor.mjs`, 'utf8');
    const preparar = servidor.indexOf('await app.prepare();');
    const filtrar = servidor.indexOf('filtrarCancelacionesDelCliente();');
    expect(preparar).toBeGreaterThan(-1);
    expect(filtrar).toBeGreaterThan(preparar);
  });
});
