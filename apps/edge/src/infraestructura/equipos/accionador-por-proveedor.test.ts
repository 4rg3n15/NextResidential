import { describe, expect, it } from 'vitest';
import { AccionadorPorProveedor } from './accionador-por-proveedor';

/** 15-Q · Q4 · el desenlace del equipo, traducido sin perder si contestó o no (O1, 15-N). */
const proveedor = (
  abrir: { aceptado: boolean; latenciaMs: number; rechazo?: string },
  veredicto = true,
) => ({
  abrir: async () => abrir,
  responderVerificacionRemota: async () => ({ aceptado: veredicto, latenciaMs: 12 }),
});

describe('AccionadorPorProveedor (15-Q, Q4)', () => {
  it('aceptada, rechazada con su motivo, o inalcanzable si no contestó', async () => {
    expect(
      await new AccionadorPorProveedor(proveedor({ aceptado: true, latenciaMs: 80 }), 'edge').abrir(
        'd',
      ),
    ).toEqual({ estado: 'aceptada', latenciaMs: 80 });
    expect(
      await new AccionadorPorProveedor(
        proveedor({ aceptado: false, latenciaMs: 90, rechazo: 'barrera bloqueada' }),
        'edge',
      ).abrir('d'),
    ).toEqual({ estado: 'rechazada', latenciaMs: 90, motivo: 'barrera bloqueada' });
    expect(
      await new AccionadorPorProveedor(
        proveedor({ aceptado: false, latenciaMs: 3000 }),
        'edge',
      ).abrir('d'),
    ).toEqual({ estado: 'inalcanzable', latenciaMs: 3000 });
  });

  it('el veredicto a la terminal: aceptado o no confirmado', async () => {
    const v = { serie: 1, permitido: true, motivo: 'ok' };
    expect(
      await new AccionadorPorProveedor(
        proveedor({ aceptado: true, latenciaMs: 1 }),
        'edge',
      ).responderVeredicto('t', v),
    ).toEqual({ estado: 'aceptada', latenciaMs: 12 });
    expect(
      await new AccionadorPorProveedor(
        proveedor({ aceptado: true, latenciaMs: 1 }, false),
        'edge',
      ).responderVeredicto('t', v),
    ).toEqual({ estado: 'inalcanzable', latenciaMs: 12 });
  });
});
