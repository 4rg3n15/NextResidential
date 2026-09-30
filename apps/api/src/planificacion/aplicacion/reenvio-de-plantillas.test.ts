import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { COLA_DE_REENVIO, ReenvioDePlantillas } from './reenvio-de-plantillas';

/** R1 (15-N) · encolado en pg-boss si está en marcha; en el proceso si no. */
const bitacora = (): { b: Bitacora; lineas: string[] } => {
  const lineas: string[] = [];
  return { b: { registrar: (_n, m) => void lineas.push(m) }, lineas };
};

describe('ReenvioDePlantillas', () => {
  it('con pg-boss en marcha, encola una por equipo y no la ejecuta aquí', async () => {
    const encolar = vi.fn(async () => true);
    const ejecutar = vi.fn(async () => ({ enviadas: 1, fallidas: 0, noVigentes: 0 }));
    const { b } = bitacora();
    const r = new ReenvioDePlantillas(
      { atender: () => undefined, encolar },
      () => ({ ejecutar }),
      'actor',
      b,
    );
    await r.encolar('cop-1', 'portero-1');
    expect(encolar).toHaveBeenCalledWith(
      COLA_DE_REENVIO,
      { copropiedadId: 'cop-1', dispositivoId: 'portero-1' },
      'reenvio:portero-1',
    );
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('sin planificador, lo hace en el proceso con la identidad del servicio y SU copropiedad', async () => {
    const ejecutar = vi.fn(async () => ({ enviadas: 2, fallidas: 0, noVigentes: 1 }));
    const { b, lineas } = bitacora();
    const r = new ReenvioDePlantillas(
      { atender: () => undefined, encolar: async () => false },
      () => ({ ejecutar }),
      'actor',
      b,
    );
    await r.encolar('cop-1', 'portero-1');
    await new Promise((listo) => setTimeout(listo, 0));
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({ copropiedadId: 'cop-1', rol: 'servicio', usuarioId: 'actor' }),
      'portero-1',
    );
    expect(lineas).toContain('reenvío de plantillas en el proceso: sin planificador');
  });

  it('una cola que revienta no tumba el alta del equipo', async () => {
    const { b, lineas } = bitacora();
    const r = new ReenvioDePlantillas(
      {
        atender: () => undefined,
        encolar: async () => {
          throw new Error('pg-boss caído');
        },
      },
      () => ({ ejecutar: async () => ({ enviadas: 0, fallidas: 0, noVigentes: 0 }) }),
      'actor',
      b,
    );
    await expect(r.encolar('cop-1', 'portero-1')).resolves.toBeUndefined();
    expect(lineas).toContain('no se pudo encolar el reenvío de plantillas');
  });

  it('el trabajo de la cola ignora datos incompletos', async () => {
    const ejecutar = vi.fn();
    const { b } = bitacora();
    const r = new ReenvioDePlantillas(
      { atender: () => undefined, encolar: async () => true },
      () => ({ ejecutar }),
      'a',
      b,
    );
    expect(await r.trabajo().ejecutar({ copropiedadId: 'cop-1' })).toEqual({
      enviadas: 0,
      fallidas: 0,
      noVigentes: 0,
    });
    expect(ejecutar).not.toHaveBeenCalled();
  });
});
