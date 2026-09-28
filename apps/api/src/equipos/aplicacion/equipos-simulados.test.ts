import { describe, expect, it } from 'vitest';
import { AVISO_DE_EQUIPOS_SIMULADOS, estadoDeEquiposSimulados } from './equipos-simulados';

describe('F3 · equipos simulados con equipos reales dados de alta', () => {
  it('simulado y con equipos: el aviso, con la frase de la consola y del ensayo', () => {
    expect(estadoDeEquiposSimulados('simulado', 3)).toEqual({
      simulado: true,
      equiposRegistrados: 3,
      aviso: AVISO_DE_EQUIPOS_SIMULADOS,
    });
  });

  it('simulado sin equipos, o el adaptador real: sin aviso', () => {
    expect(estadoDeEquiposSimulados('simulado', 0).aviso).toBeNull();
    // Cualquier clase que no sea la simulada habla con equipos de verdad. La capa
    // de aplicación no nombra adaptadores (O2): basta con una que no sea «simulado».
    expect(estadoDeEquiposSimulados('otra-clase', 5)).toMatchObject({
      simulado: false,
      aviso: null,
    });
  });
});
