import { describe, expect, it } from 'vitest';
import { ConsultarColaDeAtencion, MARGEN_DE_RELOJ_MS } from './consultar-cola';
import type { FuenteDeLaCola } from './consultar-cola';
import type { MaterialDeLaCola } from './cola-de-atencion';
import type { RepositorioDePreferenciasDeAtencion } from './preferencias-de-atencion';

const AHORA = new Date('2026-09-30T12:00:00Z');

const montar = (material: MaterialDeLaCola, guardadas: unknown = null) => {
  const pedidos: { desde: Date; hasta: Date }[] = [];
  const fuente: FuenteDeLaCola = {
    material: async (_c, desde, hasta) => {
      pedidos.push({ desde, hasta });
      return material;
    },
  };
  const preferencias: RepositorioDePreferenciasDeAtencion = {
    leer: async () => guardadas,
    guardar: async () => undefined,
  };
  return {
    pedidos,
    caso: (vigencia?: number) =>
      new ConsultarColaDeAtencion(fuente, preferencias, { ahora: () => AHORA }, vigencia),
  };
};

const VACIO: MaterialDeLaCola = { accesos: [], eventosDeEquipo: [], atendidos: new Set() };

describe('ConsultarColaDeAtencion (G1)', () => {
  it('pide a la fuente la vigencia más el margen de reloj, hacia atrás y hacia adelante', async () => {
    const m = montar(VACIO);
    await m.caso(120).ejecutar('cop');
    expect(m.pedidos[0]?.desde.getTime()).toBe(AHORA.getTime() - 120_000 - MARGEN_DE_RELOJ_MS);
    expect(m.pedidos[0]?.hasta.getTime()).toBe(AHORA.getTime() + MARGEN_DE_RELOJ_MS);
  });

  it('devuelve la cola, el resumen, la vigencia y las preferencias mezcladas', async () => {
    const m = montar(
      {
        accesos: [],
        eventosDeEquipo: [
          {
            id: 'll',
            dispositivoId: 'd',
            tipo: 'llamada',
            titulo: 'Llamada',
            enVivo: true,
            origen: 'equipo',
            eventoId: null,
            recibidoEn: new Date(AHORA.getTime() - 30_000),
          },
        ],
        atendidos: new Set(),
      },
      { llamada: { sonar: false } },
    );
    const r = await m.caso(300).ejecutar('cop');
    expect(r.total).toBe(1);
    expect(r.esperaMaxima).toBe(30);
    expect(r.vigenciaSegundos).toBe(300);
    expect(r.preferencias.llamada).toEqual({ abrir: true, sonar: false });
    expect(r.cola[0]?.id).toBe('ll');
  });
});
