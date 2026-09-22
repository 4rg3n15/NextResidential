import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { ReporteSentry, analizarDsn } from './sentry-http';
import { SinReporteDeErrores } from './sin-reporte';
import { redactar } from '../../comun/bitacora/bitacora-estructurada';

const bitacoraMuda = (): { bitacora: Bitacora; lineas: string[] } => {
  const lineas: string[] = [];
  return {
    lineas,
    bitacora: { registrar: (nivel, mensaje) => void lineas.push(`${nivel}:${mensaje}`) },
  };
};

const DSN = 'https://clavepublica123@o42.ingest.sentry.io/7654321';

describe('analizarDsn', () => {
  it('extrae clave, host, proyecto y la ruta del sobre', () => {
    expect(analizarDsn(DSN)).toEqual({
      clavePublica: 'clavepublica123',
      host: 'o42.ingest.sentry.io',
      protocolo: 'https',
      proyecto: '7654321',
      rutaEnvelope: '/api/7654321/envelope/',
    });
  });

  it('admite un Sentry autoalojado con prefijo de ruta', () => {
    const dsn = analizarDsn('https://abc@sentry.interno.local/interno/9');
    expect(dsn?.rutaEnvelope).toBe('/interno/api/9/envelope/');
  });

  it('devuelve null —y no lanza— ante cualquier cosa que no sea un DSN', () => {
    expect(analizarDsn('no-es-una-url')).toBeNull();
    expect(analizarDsn('https://sin-clave.sentry.io/1')).toBeNull();
    expect(analizarDsn('https://abc@sentry.io/no-es-numero')).toBeNull();
    expect(analizarDsn('ftp://abc@sentry.io/1')).toBeNull();
    expect(analizarDsn('')).toBeNull();
  });
});

describe('ReporteSentry', () => {
  const opciones = (enviar: typeof fetch, dsn = DSN) => {
    const { bitacora, lineas } = bitacoraMuda();
    return {
      lineas,
      opciones: { dsn, entorno: 'test', version: '0.1.0', redactar, bitacora, enviar },
    };
  };

  it('envía un sobre de TRES líneas NDJSON al endpoint del proyecto', async () => {
    const enviar = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    new ReporteSentry(o).capturar(new Error('se rompió'), { correlacion: 'abc' });

    expect(enviar).toHaveBeenCalledTimes(1);
    const [url, init] = enviar.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://o42.ingest.sentry.io/api/7654321/envelope/');
    expect(init.method).toBe('POST');

    const lineas = String(init.body).trim().split('\n');
    expect(lineas).toHaveLength(3);
    const cabecera = JSON.parse(lineas[0]!) as { event_id: string; dsn: string };
    expect(JSON.parse(lineas[1]!)).toEqual({ type: 'event' });
    const evento = JSON.parse(lineas[2]!) as Record<string, unknown>;
    expect(evento.event_id).toBe(cabecera.event_id);
    expect(evento.environment).toBe('test');
    expect(evento.level).toBe('error');
  });

  it('la cabecera de autenticación lleva la clave pública del DSN', () => {
    const enviar = vi.fn().mockResolvedValue(new Response(''));
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    new ReporteSentry(o).capturar(new Error('x'));
    const [, init] = enviar.mock.calls[0] as [string, RequestInit];
    const cabeceras = init.headers as Record<string, string>;
    expect(cabeceras['x-sentry-auth']).toContain('sentry_key=clavepublica123');
    expect(cabeceras['content-type']).toBe('application/x-sentry-envelope');
  });

  it('NO deja la clave del DSN dentro de la cabecera del sobre', () => {
    const enviar = vi.fn().mockResolvedValue(new Response(''));
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    new ReporteSentry(o).capturar(new Error('x'));
    const [, init] = enviar.mock.calls[0] as [string, RequestInit];
    const cabecera = JSON.parse(String(init.body).split('\n')[0]!) as { dsn: string };
    expect(cabecera.dsn).toBe('https://<clave>@o42.ingest.sentry.io/7654321');
  });

  it('el contexto pasa por `redactar` antes de salir: Sentry es un tercero', () => {
    const enviar = vi.fn().mockResolvedValue(new Response(''));
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    new ReporteSentry(o).capturar(new Error('x'), {
      authorization: 'Bearer secretísimo',
      placa: 'ABC123',
      ruta: '/guardia/ordenes',
    });
    const cuerpo = String((enviar.mock.calls[0] as [string, RequestInit])[1].body);
    expect(cuerpo).not.toContain('secretísimo');
    expect(cuerpo).not.toContain('ABC123');
    expect(cuerpo).toContain('[REDACTADO]');
    expect(cuerpo).toContain('/guardia/ordenes');
  });

  it('traduce el `stack` a marcos, sin desbordar', () => {
    const enviar = vi.fn().mockResolvedValue(new Response(''));
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    const error = new Error('con pila');
    new ReporteSentry(o).capturar(error);
    const evento = JSON.parse(
      String((enviar.mock.calls[0] as [string, RequestInit])[1].body).split('\n')[2]!,
    ) as {
      exception: { values: { type: string; value: string; stacktrace?: { frames: unknown[] } }[] };
    };
    const valor = evento.exception.values[0]!;
    expect(valor.type).toBe('Error');
    expect(valor.value).toBe('con pila');
    expect(valor.stacktrace!.frames.length).toBeGreaterThan(0);
    expect(valor.stacktrace!.frames.length).toBeLessThanOrEqual(20);
  });

  it('un valor lanzado que NO es Error también se reporta', () => {
    const enviar = vi.fn().mockResolvedValue(new Response(''));
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    new ReporteSentry(o).capturar('cadena suelta');
    const evento = JSON.parse(
      String((enviar.mock.calls[0] as [string, RequestInit])[1].body).split('\n')[2]!,
    ) as {
      exception: { values: { type: string; value: string }[] };
    };
    expect(evento.exception.values[0]).toMatchObject({ type: 'string', value: 'cadena suelta' });
  });

  it('un DSN mal formado AVISA una vez y deja de reportar, sin lanzar', () => {
    const enviar = vi.fn();
    const { opciones: o, lineas } = opciones(enviar as unknown as typeof fetch, 'no-es-un-dsn');
    const reporte = new ReporteSentry(o);
    expect(lineas.some((l) => l.startsWith('aviso:'))).toBe(true);
    expect(() => reporte.capturar(new Error('x'))).not.toThrow();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('si Sentry está caído, la API no se entera', () => {
    // El fallo del observador no puede convertirse en un segundo fallo.
    const enviar = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    expect(() => new ReporteSentry(o).capturar(new Error('x'))).not.toThrow();
  });

  it('si `fetch` lanza de forma síncrona, tampoco', () => {
    const enviar = vi.fn(() => {
      throw new Error('lanza al llamar');
    });
    const { opciones: o } = opciones(enviar as unknown as typeof fetch);
    expect(() => new ReporteSentry(o).capturar(new Error('x'))).not.toThrow();
  });
});

describe('SinReporteDeErrores', () => {
  it('no hace nada y no estorba', () => {
    expect(() => new SinReporteDeErrores().capturar()).not.toThrow();
  });
});
