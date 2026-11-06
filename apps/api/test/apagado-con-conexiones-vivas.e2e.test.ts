import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { RUTA_DEL_TUNEL } from '@ncr/providers';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, crearApp, crearFirmante, direccionDe, tokenDe } from './utilidades';
import { instalarCierreOrdenado, PLAZO_DE_CIERRE_MS } from '../src/arranque/cierre-ordenado';
import type { Bitacora } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-154 · SIGTERM CON LO QUE CLOUD RUN DEJA ABIERTO
 *
 * Cloud Run manda SIGTERM al retirar una instancia y SIGKILL 10 s después. Lo
 * que la retiene son las conexiones que no terminan solas: el túnel de un Edge
 * (ADR-035) y el flujo SSE de una consola. Aquí la app REAL escucha en un
 * puerto, se abren las dos, y la señal se entrega al MISMO manejador que
 * instala `main.ts`. El pool y pg-boss tienen su prueba de orden en
 * `alarmserver/orden-de-apagado.test.ts`; ésta cubre lo que va por el socket.
 * ═════════════════════════════════════════════════════════════════════════════
 */
describe('D-154 · SIGTERM cierra el túnel del Edge y el SSE, y sale con 0 dentro del plazo', () => {
  it('ambos se cierran y el proceso sale con 0 antes del plazo', async () => {
    const firmante = await crearFirmante();
    const app = await crearApp(firmante);
    const base = direccionDe(app);
    const token = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: COP_A,
      copropiedades: [COP_A],
    });

    // 1 · el flujo SSE, abierto hasta que confirma con su primer mensaje.
    const sse = await fetch(`${base}/copropiedades/${COP_A}/eventos/flujo`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    });
    expect(sse.status).toBe(200);
    const lector = (sse.body as ReadableStream<Uint8Array>).getReader();
    const primero = await lector.read();
    expect(new TextDecoder().decode(primero.value)).toContain('listo');
    const sseTermina = (async () => {
      for (;;) {
        try {
          if ((await lector.read()).done) return 'terminado';
        } catch {
          return 'cortado';
        }
      }
    })();

    // 2 · el túnel: un WebSocket aceptado, aún sin «hola», como un Edge que conecta.
    const tunel = new WebSocket(`${base.replace('http', 'ws')}${RUTA_DEL_TUNEL}`);
    await new Promise<void>((listo, falla) => {
      tunel.once('open', () => listo());
      tunel.once('error', falla);
    });
    const tunelCierra = new Promise<number>((listo) =>
      tunel.once('close', (codigo) => listo(codigo)),
    );

    // 3 · SIGTERM, al manejador de `main.ts`, sobre un proceso de mentira.
    const proceso = new EventEmitter();
    const lineas: string[] = [];
    const bitacora: Bitacora = { registrar: (_nivel, mensaje) => void lineas.push(mensaje) };
    let codigo: number | undefined;
    const salida = new Promise<number>((listo) => {
      instalarCierreOrdenado(app, bitacora, {
        proceso: proceso as unknown as Pick<NodeJS.Process, 'on'>,
        salir: (c) => {
          codigo = c;
          listo(c);
        },
      });
    });
    const inicio = Date.now();
    proceso.emit('SIGTERM');

    expect(await salida).toBe(0);
    expect(Date.now() - inicio).toBeLessThan(PLAZO_DE_CIERRE_MS);
    expect(codigo).toBe(0);
    // 1001 «going away» lo pone la puerta del túnel al cerrarse; sin ella, el
    // túnel acaba en 1008 cuando vence la espera del «hola» (5 s), retiene el
    // cierre y esta línea lo dice.
    expect(await tunelCierra).toBe(1001);
    expect(['terminado', 'cortado']).toContain(await sseTermina);
    expect(lineas).toContain('API cerrada: escuchas, latidos y pools terminados');
    expect(lineas).not.toContain('el cierre no terminó a tiempo: se sale igual');
  }, 30_000);
});
