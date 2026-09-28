import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { FRESCURA_DE_SENAL_MS, LatidosDeEquipos } from './latidos-de-equipos';

/**
 * C4 (ETAPA 15-L) · el latido sale de una señal REAL: la escucha que oyó al
 * equipo hace poco, o una lectura del equipo. Lo que calla no late.
 */
const AHORA = new Date('2026-09-27T15:00:00Z');
const COP = '10000000-0000-4000-8000-000000000001';

const montar = (
  estados: Record<string, 'en_linea' | 'fuera_de_linea' | 'degradado' | Error>,
  senales: Record<string, Date> = {},
) => {
  const escritos: { dispositivoId: string; en: Date }[] = [];
  const lineas: string[] = [];
  const bitacora: Bitacora = { registrar: (_n, m) => void lineas.push(m) };
  const estado = vi.fn(async (id: string) => {
    const e = estados[id];
    if (e instanceof Error) throw e;
    return e ?? 'fuera_de_linea';
  });
  const latidos = new LatidosDeEquipos(
    {
      activos: async () =>
        Object.keys(estados).map((dispositivoId) => ({
          dispositivoId,
          copropiedadId: COP,
          nombre: dispositivoId,
        })),
    },
    { estado },
    { ultimaSenal: (id) => senales[id] ?? null },
    {
      registrarLatido: async (_c, dispositivoId, en) => void escritos.push({ dispositivoId, en }),
    },
    { ahora: () => AHORA },
    bitacora,
    { intervaloMs: 0 },
  );
  return { latidos, escritos, estado, lineas };
};

describe('LatidosDeEquipos', () => {
  it('con señal fresca de la escucha, esa es el latido: no se pregunta al equipo', async () => {
    const hace = new Date(AHORA.getTime() - 5_000);
    const { latidos, escritos, estado } = montar(
      { terminal: 'fuera_de_linea' },
      { terminal: hace },
    );
    expect(await latidos.pasada()).toEqual({ porSenal: 1, porSondeo: 0, sinRespuesta: 0 });
    expect(escritos).toEqual([{ dispositivoId: 'terminal', en: hace }]);
    expect(estado).not.toHaveBeenCalled();
  });

  it('con la señal vieja, o sin escucha, se le pregunta; sólo «en línea» late', async () => {
    const vieja = new Date(AHORA.getTime() - FRESCURA_DE_SENAL_MS - 1);
    const { latidos, escritos } = montar(
      { camara: 'en_linea', rele: 'degradado', terminal: 'fuera_de_linea' },
      { terminal: vieja },
    );
    expect(await latidos.pasada()).toEqual({ porSenal: 0, porSondeo: 1, sinRespuesta: 2 });
    expect(escritos).toEqual([{ dispositivoId: 'camara', en: AHORA }]);
  });

  it('un equipo que revienta al preguntarle queda sin latido y se dice', async () => {
    const { latidos, escritos, lineas } = montar({ camara: new Error('sin red') });
    expect(await latidos.pasada()).toEqual({ porSenal: 0, porSondeo: 0, sinRespuesta: 1 });
    expect(escritos).toEqual([]);
    expect(lineas).toContain('latido de equipo: sin respuesta');
  });

  it('dos pasadas a la vez no se solapan', async () => {
    const { latidos } = montar({ camara: 'en_linea' });
    const [a, b] = await Promise.all([latidos.pasada(), latidos.pasada()]);
    expect(a.porSondeo + b.porSondeo).toBe(1);
  });

  it('si el registro de equipos no contesta, la pasada no tumba el proceso', async () => {
    const lineas: string[] = [];
    const latidos = new LatidosDeEquipos(
      {
        activos: async () => {
          throw new Error('base caída');
        },
      },
      { estado: async () => 'en_linea' },
      { ultimaSenal: () => null },
      { registrarLatido: async () => undefined },
      { ahora: () => AHORA },
      { registrar: (_n, m) => void lineas.push(m) },
    );
    expect(await latidos.pasada()).toEqual({ porSenal: 0, porSondeo: 0, sinRespuesta: 0 });
    expect(lineas).toContain('latido de equipos: no se pudo leer el registro');
  });
});
