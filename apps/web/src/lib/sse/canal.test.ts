import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirCanal } from './canal';
import type { EstadoDelCanal } from './canal';
import type { EventoRegistrado } from '@ncr/contracts';

/**
 * El canal en vivo se prueba con una fuente SSE falsa y relojes controlados.
 *
 * Lo que aquí se protege no es que «funcione»: es que **falle de la forma
 * correcta**. Un canal que se cae sin avisar deja la lista congelada y el
 * operador cree que no pasa nada; uno que reintenta sin retroceso convierte una
 * caída de la API en una tormenta de reconexiones.
 */
class FuenteFalsa implements Partial<EventSource> {
  static abiertas: FuenteFalsa[] = [];
  readonly oyentes = new Map<string, ((m: MessageEvent<string>) => void)[]>();
  onerror: ((e: Event) => void) | null = null;
  cerrada = false;

  constructor(readonly url: string) {
    FuenteFalsa.abiertas.push(this);
  }

  addEventListener(tipo: string, oyente: (m: MessageEvent<string>) => void): void {
    this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), oyente]);
  }

  close(): void {
    this.cerrada = true;
  }

  emitir(tipo: string, datos: unknown): void {
    for (const o of this.oyentes.get(tipo) ?? []) {
      o({ data: JSON.stringify(datos) } as MessageEvent<string>);
    }
  }

  fallar(): void {
    this.onerror?.(new Event('error'));
  }
}

const evento = (id: string, ocurridoEn: string): EventoRegistrado =>
  ({ id, ocurridoEn, tipo: 'ingreso', resultado: 'permitido' }) as EventoRegistrado;

const COP = '10000000-0000-4000-8000-000000000001';

let estados: { estado: EstadoDelCanal; intento: number }[];
let eventos: EventoRegistrado[];
let recuperados: EventoRegistrado[][];

const espias = () => ({
  estado: (estado: EstadoDelCanal, intento: number) => estados.push({ estado, intento }),
  evento: (e: EventoRegistrado) => eventos.push(e),
  alerta: () => undefined,
  recuperados: (e: readonly EventoRegistrado[]) => recuperados.push([...e]),
});

beforeEach(() => {
  vi.useFakeTimers();
  FuenteFalsa.abiertas = [];
  estados = [];
  eventos = [];
  recuperados = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/sesion/estado')) {
        return new Response(
          JSON.stringify({ autenticado: true, expiraEn: null, segundoFactorPendiente: false }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ filas: [evento('recuperado', '2026-09-09T12:05:00Z')] }),
        {
          status: 200,
        },
      );
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const abrir = () =>
  abrirCanal({
    copropiedadId: COP,
    mensajes: espias(),
    crearFuente: (url) => new FuenteFalsa(url) as unknown as EventSource,
    ahora: () => Date.UTC(2026, 8, 9, 12, 10, 0),
    // Jitter fijo al máximo: hace la espera determinista sin desactivar la
    // política. Probar con `() => 0` mediría el suelo, no el retroceso.
    aleatorio: () => 1,
  });

describe('abrirCanal', () => {
  it('se suscribe al flujo de la copropiedad, no a un canal global', () => {
    const baja = abrir();
    expect(FuenteFalsa.abiertas[0]?.url).toBe(`/api/ncr/copropiedades/${COP}/eventos/flujo`);
    baja();
  });

  it('anuncia «conectando» y luego «conectado» al recibir el saludo', () => {
    const baja = abrir();
    expect(estados[0]).toEqual({ estado: 'conectando', intento: 0 });
    FuenteFalsa.abiertas[0]?.emitir('listo', { copropiedadId: COP });
    expect(estados.at(-1)).toEqual({ estado: 'conectado', intento: 0 });
    baja();
  });

  it('entrega los eventos del tema «eventos»', () => {
    const baja = abrir();
    FuenteFalsa.abiertas[0]?.emitir('listo', {});
    FuenteFalsa.abiertas[0]?.emitir('eventos', evento('e1', '2026-09-09T12:00:00Z'));
    expect(eventos.map((e) => e.id)).toEqual(['e1']);
    baja();
  });

  it('un mensaje ilegible no tumba el canal', () => {
    const baja = abrir();
    const fuente = FuenteFalsa.abiertas[0];
    fuente?.emitir('listo', {});
    for (const o of fuente?.oyentes.get('eventos') ?? []) {
      o({ data: 'esto no es json' } as MessageEvent<string>);
    }
    fuente?.emitir('eventos', evento('e2', '2026-09-09T12:01:00Z'));
    expect(eventos.map((e) => e.id)).toEqual(['e2']);
    baja();
  });

  it('al caer avisa y reintenta con retroceso, sin abrir de inmediato', () => {
    const baja = abrir();
    FuenteFalsa.abiertas[0]?.emitir('listo', {});
    FuenteFalsa.abiertas[0]?.fallar();

    expect(estados.at(-1)?.estado).toBe('reconectando');
    // Nada de reconexión síncrona: es lo que convierte una caída en un bucle.
    expect(FuenteFalsa.abiertas).toHaveLength(1);

    vi.advanceTimersByTime(1_000);
    expect(FuenteFalsa.abiertas).toHaveLength(2);
    baja();
  });

  it('el retroceso crece con cada fallo consecutivo', () => {
    const baja = abrir();
    FuenteFalsa.abiertas[0]?.fallar();
    vi.advanceTimersByTime(1_000);
    FuenteFalsa.abiertas[1]?.fallar();

    // Segundo intento: 2 s. A 1 999 ms todavía no debe haber reabierto.
    vi.advanceTimersByTime(1_999);
    expect(FuenteFalsa.abiertas).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FuenteFalsa.abiertas).toHaveLength(3);
    baja();
  });

  it('tras un corte recupera el histórico perdido, y no en la primera conexión', async () => {
    const baja = abrir();
    FuenteFalsa.abiertas[0]?.emitir('listo', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(recuperados).toHaveLength(0);

    FuenteFalsa.abiertas[0]?.emitir('eventos', evento('e1', '2026-09-09T12:00:00Z'));
    FuenteFalsa.abiertas[0]?.fallar();
    await vi.advanceTimersByTimeAsync(1_000);
    FuenteFalsa.abiertas[1]?.emitir('listo', {});
    await vi.advanceTimersByTimeAsync(0);

    expect(recuperados[0]?.map((e) => e.id)).toEqual(['recuperado']);
    baja();
  });

  it('la recuperación pide desde el ÚLTIMO evento visto, no desde el principio', async () => {
    const baja = abrir();
    FuenteFalsa.abiertas[0]?.emitir('listo', {});
    FuenteFalsa.abiertas[0]?.emitir('eventos', evento('e1', '2026-09-09T12:03:00Z'));
    FuenteFalsa.abiertas[0]?.fallar();
    await vi.advanceTimersByTimeAsync(1_000);
    FuenteFalsa.abiertas[1]?.emitir('listo', {});
    await vi.advanceTimersByTimeAsync(0);

    const llamadas = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    const historial = llamadas.map((c) => c[0]).find((u) => u?.includes('desde='));
    expect(historial).toContain('desde=2026-09-09T12%3A03%3A00Z');
    baja();
  });

  it('cerrar el canal detiene los reintentos programados', () => {
    const baja = abrir();
    FuenteFalsa.abiertas[0]?.fallar();
    baja();
    vi.advanceTimersByTime(60_000);
    // Sin esto, un componente desmontado seguiría reabriendo conexiones contra
    // la API para siempre.
    expect(FuenteFalsa.abiertas).toHaveLength(1);
    expect(FuenteFalsa.abiertas[0]?.cerrada).toBe(true);
    baja();
  });
});
