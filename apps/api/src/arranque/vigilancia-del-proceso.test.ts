import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { instalarVigilanciaDelProceso } from './vigilancia-del-proceso';

const montar = () => {
  const oyentes = new Map<string, (x: unknown) => void>();
  const lineas: { nivel: string; mensaje: string; datos: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, datos) => void lineas.push({ nivel, mensaje, datos }),
  };
  const cerrar = vi.fn(async () => undefined);
  instalarVigilanciaDelProceso(bitacora, cerrar, {
    on: ((evento: string, f: (x: unknown) => void) => oyentes.set(evento, f)) as never,
  });
  return { oyentes, lineas, cerrar };
};

describe('15-P · 0.1 · vigilancia del proceso', () => {
  it('una promesa rechazada sin manejar se registra y NO cierra la API', () => {
    const { oyentes, lineas, cerrar } = montar();
    oyentes.get('unhandledRejection')?.(new Error('falló postgresql://u:clave@host/base'));
    expect(lineas[0]).toMatchObject({
      nivel: 'error',
      datos: { detalle: 'falló <cadena de conexión>' },
    });
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('una excepción sin capturar se registra y pide el cierre ordenado con código 1', () => {
    const { oyentes, lineas, cerrar } = montar();
    oyentes.get('uncaughtException')?.(new TypeError('x no es una función'));
    expect(lineas[0]).toMatchObject({
      mensaje: 'excepción sin capturar: cierre ordenado',
      datos: { tipo: 'TypeError' },
    });
    expect(cerrar).toHaveBeenCalledWith('uncaughtException', 1);
  });
});
