import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { LATIDO_SSE_MS, abrirFlujoSse } from './escritor-sse';
import type { CanalEnProceso } from '../infraestructura/canal-en-proceso';

/**
 * D-67 · EL CANAL DE EVENTOS SE MORÍA CADA CINCO MINUTOS
 *
 * Reportado desde el despliegue en Windows: la consola escupía
 * `failed to pipe response` con `UND_ERR_BODY_TIMEOUT` una y
 * otra vez, al rato de estar en pie.
 *
 * La causa no era Windows. Este flujo escribía `event: listo` al abrir y
 * **después nada hasta que hubiera un evento**; el `fetch` de Node aborta el
 * cuerpo de una respuesta tras 300 s sin datos, así que en una copropiedad
 * tranquila el canal moría solo, la consola reconectaba, y vuelta a empezar.
 *
 * Nadie lo había visto porque **las pruebas no esperan**: un flujo que se abre,
 * recibe su evento y se cierra en milisegundos nunca llega al plazo. El tiempo
 * se simula con relojes falsos, que es la única forma de ejercer esto sin
 * tener una prueba de cinco minutos.
 */
const respuestaFalsa = () => {
  const escrito: string[] = [];
  const oyentes = new Map<string, () => void>();
  return {
    escrito,
    cerrar: () => oyentes.get('close')?.(),
    respuesta: {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: (texto: string) => {
        escrito.push(texto);
        return true;
      },
      end: vi.fn(),
      on: (evento: string, cb: () => void) => {
        oyentes.set(evento, cb);
      },
      writableEnded: false,
    } as unknown as Response,
  };
};

const canalFalso = { suscribir: () => () => undefined } as unknown as CanalEnProceso;

describe('latido del flujo SSE', () => {
  it('escribe un comentario antes de que venza el plazo de undici', () => {
    vi.useFakeTimers();
    const { respuesta, escrito } = respuestaFalsa();
    abrirFlujoSse(respuesta, canalFalso, 'cop-1');

    // Al abrir solo está el `listo`: ningún latido todavía.
    expect(escrito).toHaveLength(1);
    expect(escrito[0]).toContain('event: listo');

    vi.advanceTimersByTime(LATIDO_SSE_MS);
    expect(escrito[1]).toBe(':\n\n');

    vi.useRealTimers();
  });

  it('el plazo queda MUY por debajo de los 300 s en que undici aborta', () => {
    // El número concreto es menos importante que el margen: también hay que
    // caber bajo los 30-60 s típicos de un túnel o un proxy inverso, que es
    // por donde va a entrar la guardia virtual.
    expect(LATIDO_SSE_MS).toBeLessThan(30_000);
    expect(LATIDO_SSE_MS).toBeGreaterThan(5_000);
  });

  it('late varias veces: no es un empujón único al abrir', () => {
    vi.useFakeTimers();
    const { respuesta, escrito } = respuestaFalsa();
    abrirFlujoSse(respuesta, canalFalso, 'cop-1');

    vi.advanceTimersByTime(LATIDO_SSE_MS * 5);
    const latidos = escrito.filter((l) => l === ':\n\n');
    expect(latidos).toHaveLength(5);

    vi.useRealTimers();
  });

  it('un comentario SSE no es un evento: el navegador lo ignora', () => {
    // Es lo que lo hace seguro. Si fuese un `event:`, cada cliente tendría que
    // conocerlo y descartarlo; un comentario ya lo descarta el estándar.
    vi.useFakeTimers();
    const { respuesta, escrito } = respuestaFalsa();
    abrirFlujoSse(respuesta, canalFalso, 'cop-1');
    vi.advanceTimersByTime(LATIDO_SSE_MS);

    const latido = escrito[1] ?? '';
    expect(latido.startsWith(':')).toBe(true);
    expect(latido).not.toContain('event:');
    expect(latido).not.toContain('data:');

    vi.useRealTimers();
  });

  it('al cerrarse el flujo, el latido se detiene', () => {
    // Sin esto quedaría un intervalo escribiendo sobre una respuesta muerta,
    // una fuga por cada consola que alguien cierra — y la prueba de estabilidad
    // de la semana es justo donde eso se acumularía.
    vi.useFakeTimers();
    const { respuesta, escrito, cerrar } = respuestaFalsa();
    abrirFlujoSse(respuesta, canalFalso, 'cop-1');

    vi.advanceTimersByTime(LATIDO_SSE_MS);
    const antes = escrito.length;
    cerrar();
    vi.advanceTimersByTime(LATIDO_SSE_MS * 3);
    expect(escrito).toHaveLength(antes);

    vi.useRealTimers();
  });
});
