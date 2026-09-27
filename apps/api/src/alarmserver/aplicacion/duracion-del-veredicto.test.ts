import { describe, expect, it } from 'vitest';
import type { EventoDeEquipo } from '@ncr/providers';
import type { EventoDeEquipoNuevo } from '../../eventos';
import { ConstanciasDeEquipo } from './constancias-de-equipo';

/**
 * F2 (corrección de la 15-L) · el veredicto que la plataforma devuelve a una
 * terminal deja su DURACIÓN en la fila de `eventos_de_equipo`. Es lo que lee
 * el ensayo para comparar p50/p95 con el plazo de la terminal
 * (`TERMINAL_PLAZO_DE_VERIFICACION_S`): sin la cifra en la base, habría que
 * buscarla en los registros de texto del Mac.
 */
const EVENTO = {
  dispositivoId: 'terminal-1',
  ocurridoEn: new Date('2026-09-27T15:00:00Z'),
  enVivo: true,
  referenciaDelEquipo: 'ev-1',
  serieDelEquipo: 4711,
  horaDelEquipo: null,
  codigo: null,
  tipo: 'rostro',
  titulo: 'Rostro reconocido',
  carga: {},
} as unknown as EventoDeEquipo;

describe('F2 · la duración del veredicto queda en la fila', () => {
  it('con el veredicto aceptado y su duración en milisegundos', async () => {
    const filas: EventoDeEquipoNuevo[] = [];
    const constancias = new ConstanciasDeEquipo(
      {
        vivo: async (f) => {
          filas.push(f);
          return null;
        },
        historico: () => undefined,
      },
      { nuevo: () => 'id-1' },
    );
    await constancias.veredicto(
      EVENTO,
      'cop-1',
      { serie: 4711, permitido: true, motivo: 'acceso permitido' },
      true,
      'evento-1',
      1234,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      tipo: 'resultado_de_verificacion',
      origen: 'plataforma',
      carga: { aceptadoPorElEquipo: true, duracionMs: 1234, permitido: true },
    });
  });

  it('también cuando la terminal no lo confirmó: la duración decide el plan B', async () => {
    const filas: EventoDeEquipoNuevo[] = [];
    const constancias = new ConstanciasDeEquipo(
      {
        vivo: async (f) => {
          filas.push(f);
          return null;
        },
        historico: () => undefined,
      },
      { nuevo: () => 'id-2' },
    );
    await constancias.veredicto(
      EVENTO,
      'cop-1',
      { serie: 4711, permitido: false, motivo: 'FALLO_TECNICO' },
      false,
      null,
      9100,
    );
    expect(filas[0]?.titulo).toMatch(/no lo confirmó/);
    expect(filas[0]?.carga).toMatchObject({ aceptadoPorElEquipo: false, duracionMs: 9100 });
  });
});
