import { describe, expect, it, vi } from 'vitest';
import { defer, firstValueFrom, lastValueFrom, of, throwError, concat } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Bitacora } from '@ncr/domain-core';
import { InterceptorDeReintentoDeLecturas } from './reintento-de-lecturas';

const contexto = (method: string, tipo = 'http') =>
  ({
    getType: () => tipo,
    switchToHttp: () => ({ getRequest: () => ({ method, path: '/copropiedades/x/eventos' }) }),
  }) as unknown as ExecutionContext;

const corte = () => new Error('Connection terminated unexpectedly');

/** Un manejador que falla las `fallos` primeras veces que se le suscribe. */
const manejador = (fallos: number, error: () => unknown = corte) => {
  let llamadas = 0;
  const handler: CallHandler = {
    handle: () =>
      defer(() => {
        llamadas += 1;
        return llamadas <= fallos ? throwError(error) : of('ok');
      }),
  };
  return { handler, llamadas: () => llamadas };
};

const montar = () => {
  const registrar = vi.fn();
  return {
    registrar,
    interceptor: new InterceptorDeReintentoDeLecturas({ registrar } as unknown as Bitacora),
  };
};

describe('15-O · una lectura cortada se reintenta una vez', () => {
  it('GET cortado: se repite UNA vez, responde y lo dice', async () => {
    const { interceptor, registrar } = montar();
    const m = manejador(1);
    expect(await firstValueFrom(interceptor.intercept(contexto('GET'), m.handler))).toBe('ok');
    expect(m.llamadas()).toBe(2);
    expect(registrar).toHaveBeenCalledWith(
      'aviso',
      'lectura reintentada tras un corte de la base',
      expect.objectContaining({ metodo: 'GET' }),
    );
  });

  it('si la base sigue caída, el segundo fallo es el que sale', async () => {
    const { interceptor } = montar();
    const m = manejador(5);
    await expect(
      firstValueFrom(interceptor.intercept(contexto('HEAD'), m.handler)),
    ).rejects.toThrow(/Connection terminated/);
    expect(m.llamadas()).toBe(2);
  });

  it('una escritura NO se repite: sale el corte tal cual', async () => {
    const { interceptor } = montar();
    const m = manejador(1);
    await expect(
      firstValueFrom(interceptor.intercept(contexto('POST'), m.handler)),
    ).rejects.toThrow(/Connection terminated/);
    expect(m.llamadas()).toBe(1);
  });

  it('un error que no es de conexión no se repite', async () => {
    const { interceptor } = montar();
    const m = manejador(1, () => new Error('regla de negocio'));
    await expect(firstValueFrom(interceptor.intercept(contexto('GET'), m.handler))).rejects.toThrow(
      'regla de negocio',
    );
    expect(m.llamadas()).toBe(1);
  });

  it('un flujo que ya emitió no se reabre por debajo', async () => {
    const { interceptor } = montar();
    let suscripciones = 0;
    const handler: CallHandler = {
      handle: () =>
        defer(() => {
          suscripciones += 1;
          return concat(of('primero'), throwError(corte));
        }),
    };
    await expect(lastValueFrom(interceptor.intercept(contexto('GET'), handler))).rejects.toThrow(
      /Connection terminated/,
    );
    expect(suscripciones).toBe(1);
  });

  it('fuera de HTTP no interviene', async () => {
    const { interceptor } = montar();
    const m = manejador(1);
    await expect(
      firstValueFrom(interceptor.intercept(contexto('GET', 'rpc'), m.handler)),
    ).rejects.toThrow();
    expect(m.llamadas()).toBe(1);
  });
});
