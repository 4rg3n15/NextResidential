import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import type { EscuchaActiva } from '@ncr/providers';
import { EscuchasDeEquipos } from './escuchas-de-equipos';
import type { EquipoAEscuchar } from './puertos';

const equipo = (id: string): EquipoAEscuchar => ({
  dispositivoId: id,
  copropiedadId: 'cop-1',
  nombre: `Equipo ${id}`,
});

const montar = (activos: EquipoAEscuchar[], habilitadas = true) => {
  const detenidas: string[] = [];
  const lineas: string[] = [];
  const bitacora: Bitacora = { registrar: (_n, m) => void lineas.push(m) };
  const escuchar = vi.fn(async (id: string): Promise<EscuchaActiva> => {
    if (id === 'rota') throw new Error('equipo apagado');
    return {
      dispositivoId: id,
      transporte: 'suscripcion',
      detalle: 'ok',
      detener: () => void detenidas.push(id),
    };
  });
  const escuchas = new EscuchasDeEquipos({ activos: async () => activos }, { escuchar }, bitacora, {
    habilitadas,
    intervaloMs: 60_000,
  });
  return { escuchas, escuchar, detenidas, lineas, activos };
};

describe('EscuchasDeEquipos (A4)', () => {
  it('arma una escucha por equipo activo y no la repite', async () => {
    const { escuchas, escuchar } = montar([equipo('a'), equipo('b')]);
    expect(await escuchas.rearmar()).toEqual({ armadas: 2, detenidas: 0, activas: 2 });
    expect(await escuchas.rearmar()).toEqual({ armadas: 0, detenidas: 0, activas: 2 });
    expect(escuchar).toHaveBeenCalledTimes(2);
  });

  it('un equipo que no se pudo abrir no impide los demás, y se reintenta después', async () => {
    const { escuchas, escuchar, lineas } = montar([equipo('rota'), equipo('b')]);
    expect(await escuchas.rearmar()).toMatchObject({ armadas: 1, activas: 1 });
    expect(lineas).toContain('no se pudo abrir la escucha de un equipo');
    await escuchas.rearmar();
    expect(escuchar).toHaveBeenCalledTimes(3);
  });

  it('un equipo dado de baja deja de escucharse en el siguiente rearme', async () => {
    const { escuchas, detenidas, activos } = montar([equipo('a'), equipo('b')]);
    await escuchas.rearmar();
    activos.splice(1, 1);
    expect(await escuchas.rearmar()).toEqual({ armadas: 0, detenidas: 1, activas: 1 });
    expect(detenidas).toEqual(['b']);
  });

  it('apagar el proceso detiene todas', async () => {
    const { escuchas, detenidas } = montar([equipo('a'), equipo('b')]);
    await escuchas.onApplicationBootstrap();
    escuchas.onApplicationShutdown();
    expect(detenidas.sort()).toEqual(['a', 'b']);
  });

  it('con el proveedor simulado no arma nada, y lo dice', async () => {
    const { escuchas, escuchar, lineas } = montar([equipo('a')], false);
    await escuchas.onApplicationBootstrap();
    expect(escuchar).not.toHaveBeenCalled();
    expect(lineas).toContain('escuchas de equipo desactivadas');
    escuchas.onApplicationShutdown();
  });

  it('si el registro no responde, no se cae: se registra y se conserva lo que había', async () => {
    const bitacora: Bitacora = { registrar: () => undefined };
    const escuchas = new EscuchasDeEquipos(
      {
        activos: async () => {
          throw new Error('sin base');
        },
      },
      {
        escuchar: async () => ({
          dispositivoId: 'x',
          transporte: 'ninguna',
          detalle: '',
          detener: () => undefined,
        }),
      },
      bitacora,
      { habilitadas: true },
    );
    expect(await escuchas.rearmar()).toEqual({ armadas: 0, detenidas: 0, activas: 0 });
  });
});
