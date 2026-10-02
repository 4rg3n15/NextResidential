import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { SesionDeTunel, enlacesEnMemoria } from '@ncr/providers';
import { TunelesDeEdge } from '../../proveedores';
import type { TunelVivo } from '../../proveedores';
import { AlertaDeDesconexion, CLAVE_EDGE_DESCONECTADO } from './alerta-de-desconexion';
import type { AlertaParaEquipo, EquiposDelConjunto, Temporizador } from './alerta-de-desconexion';

/**
 * 15-Q2 · A3 · lo que `publicaciones-y-alertas.test.ts` no recorre: el Edge que
 * nunca se vio, el fallo que no es `Error`, el fallo al abrir una alerta, el
 * evento «conectado» y el temporizador real con su gracia.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EDGE = 'a0000001-0000-4000-8000-000000000001';

type Nueva = Parameters<AlertaParaEquipo['ejecutar']>[0];

const montar = (
  o: {
    activos?: EquiposDelConjunto['activos'];
    ejecutar?: (n: Nueva) => Promise<unknown>;
    graciaMs?: number;
    temporizador?: Temporizador;
  } = {},
) => {
  const tuneles = new TunelesDeEdge();
  const abiertas: { nueva: Nueva; actor: string }[] = [];
  const lineas: { nivel: string; mensaje: string; contexto: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, contexto) => void lineas.push({ nivel, mensaje, contexto }),
  };
  const ejecutar = o.ejecutar ?? (async () => undefined);
  const alerta = new AlertaDeDesconexion(
    tuneles,
    {
      activos:
        o.activos ??
        (async () => [
          { copropiedadId: COP, dispositivoId: 'cam-a' },
          { copropiedadId: COP, dispositivoId: 'portero-a' },
        ]),
    },
    {
      ejecutar: async (nueva, actor) => {
        abiertas.push({ nueva, actor });
        return ejecutar(nueva);
      },
    },
    'actor-de-servicio',
    bitacora,
    // `undefined` deja el valor por omisión: la gracia de 30 s y el temporizador real.
    o.graciaMs,
    o.temporizador,
  );
  const tunel: TunelVivo = {
    copropiedadId: COP,
    edgeId: EDGE,
    sesion: new SesionDeTunel(enlacesEnMemoria()[0], { paridad: 'par' }),
    desde: new Date('2026-10-02T11:00:00Z'),
  };
  return { tuneles, alerta, abiertas, lineas, tunel };
};

describe('AlertaDeDesconexion · ramas restantes (15-Q2, A3)', () => {
  it('un Edge que nunca se vio conectado: alerta igual, y la nota dice «hace un momento»', async () => {
    const m = montar();
    expect(await m.alerta.siSigue(COP, EDGE)).toBe(2);
    expect(m.abiertas.map((a) => a.nueva.notas)).toEqual([
      expect.stringContaining('no está conectado desde hace un momento'),
      expect.stringContaining('no está conectado desde hace un momento'),
    ]);
  });

  it('con la caída anotada: la nota lleva el instante, y cada alerta es alta, persistente y del actor', async () => {
    const m = montar();
    m.tuneles.ocupar(m.tunel);
    m.tuneles.liberar(m.tunel, new Date('2026-10-02T12:00:00Z'));
    await m.alerta.siSigue(COP, EDGE);
    expect(m.abiertas[0]).toEqual({
      actor: 'actor-de-servicio',
      nueva: expect.objectContaining({
        copropiedadId: COP,
        dispositivoId: 'cam-a',
        tipo: 'dispositivo_caido',
        severidad: 'alta',
        clave: CLAVE_EDGE_DESCONECTADO,
        persistente: true,
        notas: expect.stringContaining('desde 2026-10-02T12:00:00.000Z'),
      }),
    });
  });

  it('un fallo que no es Error: devuelve 0, no lanza, y la bitácora lleva su texto', async () => {
    const m = montar({ activos: () => Promise.reject('sin conexión') });
    expect(await m.alerta.siSigue(COP, EDGE)).toBe(0);
    expect(m.lineas).toEqual([
      {
        nivel: 'error',
        mensaje: 'no se pudo alertar la desconexión del Edge',
        contexto: { edgeId: EDGE, error: 'sin conexión' },
      },
    ]);
  });

  it('si falla la alerta de un equipo, los demás SÍ se avisan y se cuentan sólo las abiertas', async () => {
    const m = montar({
      ejecutar: async (n) => {
        if (n.dispositivoId === 'cam-a') throw new Error('alertas no disponibles');
      },
    });
    const intentadas = await m.alerta.siSigue(COP, EDGE);
    expect(m.abiertas.length).toBeGreaterThan(1);
    expect(intentadas).toBe(m.abiertas.length - 1);
    expect(m.lineas[0]?.contexto).toEqual({
      edgeId: EDGE,
      dispositivoId: 'cam-a',
      error: 'alertas no disponibles',
    });
  });

  it('el evento «conectado» no programa ninguna espera', () => {
    const esperas: number[] = [];
    const m = montar({ temporizador: { esperar: (ms) => void esperas.push(ms) }, graciaMs: 7 });
    m.alerta.vigilar();
    m.tuneles.ocupar(m.tunel);
    expect(esperas).toEqual([]);
    m.tuneles.liberar(m.tunel, new Date());
    expect(esperas).toEqual([7]);
  });

  it('sin temporizador inyectado, usa el real: pasada la gracia, alerta', async () => {
    const m = montar({ graciaMs: 5 });
    m.alerta.vigilar();
    m.tuneles.ocupar(m.tunel);
    m.tuneles.liberar(m.tunel, new Date());
    expect(m.abiertas).toEqual([]);
    await vi.waitFor(() => expect(m.abiertas).toHaveLength(2));
  });
});
