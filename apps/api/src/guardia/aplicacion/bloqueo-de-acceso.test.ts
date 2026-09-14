import { describe, expect, it } from 'vitest';
import type { ResultadoDeAccionamiento } from '@ncr/domain-core';
import { ordenAceptada, ordenInalcanzable } from '@ncr/domain-core';
import { FijarBloqueoDeAcceso } from './bloqueo-de-acceso';
import type { BloqueoDeAcceso } from './apertura-manual';
import type { BloqueoVigente, RegistroDeBloqueos } from './bloqueo-de-acceso';
import type { ContextoTenant } from '../../autenticacion';

/**
 * Bloqueo y desbloqueo — H-3.
 *
 * Igual que en la apertura manual, lo que se comprueba **no es la respuesta**:
 * es que la orden no llegue al equipo cuando no debe. Una prueba que mirara el
 * cuerpo devuelto pasaría con una implementación que bloquea primero y contesta
 * mal después.
 */
const COP = 'cop-a';

const ctx = (rol: ContextoTenant['rol'], copropiedadId: string | null = COP): ContextoTenant =>
  ({
    rol,
    usuarioId: 'admin-1',
    copropiedadId,
    copropiedadesAtendidas: [],
    mfaVerificado: true,
  }) as unknown as ContextoTenant;

const banco = (responde: ResultadoDeAccionamiento = ordenAceptada(9)) => {
  const ordenadas: { dispositivoId: string; bloqueado: boolean }[] = [];
  const escritos: BloqueoVigente[] = [];
  const barrera: BloqueoDeAcceso = {
    fijarBloqueo: async (dispositivoId, bloqueado) => {
      ordenadas.push({ dispositivoId, bloqueado });
      return responde;
    },
  };
  const registro: RegistroDeBloqueos = {
    fijar: async (b) => {
      escritos.push(b);
    },
    anotarResultado: async (copropiedadId, dispositivoId, resultado, detalle) => {
      const indice = escritos.findIndex(
        (b) => b.copropiedadId === copropiedadId && b.dispositivoId === dispositivoId,
      );
      if (indice >= 0) escritos[indice] = { ...escritos[indice]!, resultado, detalle };
    },
    vigente: async () => escritos[escritos.length - 1] ?? null,
    todos: async () => escritos,
  };
  return {
    caso: new FijarBloqueoDeAcceso(barrera, registro, {
      ahora: () => new Date('2026-09-15T12:00:00Z'),
    }),
    ordenadas,
    escritos,
  };
};

const orden = {
  copropiedadId: COP,
  dispositivoId: 'disp-1',
  bloqueado: true,
  motivo: 'Mantenimiento de la talanquera coordinado con la administración',
};

describe('sin motivo válido NO se bloquea · la prueba mira el accionador', () => {
  const invalidos = ['', '   ', 'corto', 'x'.repeat(400)];

  for (const motivo of invalidos) {
    it(`«${motivo.slice(0, 12)}…» no llega al equipo`, async () => {
      const { caso, ordenadas, escritos } = banco();
      const r = await caso.ejecutar(ctx('administrador'), { ...orden, motivo });
      expect(r.ok).toBe(false);
      // Lo que importa: el equipo no recibió nada. Y tampoco se escribió un
      // estado con dueño que luego habría que explicar.
      expect(ordenadas).toHaveLength(0);
      expect(escritos).toHaveLength(0);
    });
  }
});

describe('quién puede bloquear', () => {
  it('administrador y superadministrador, sí', async () => {
    for (const rol of ['administrador', 'superadministrador'] as const) {
      const { caso, ordenadas } = banco();
      const r = await caso.ejecutar(ctx(rol), orden);
      expect(r.ok, rol).toBe(true);
      expect(ordenadas).toHaveLength(1);
    }
  });

  it('el portero NO: dejar el conjunto sin entrada es de administración (H-3)', async () => {
    for (const rol of ['portero', 'operador_central', 'residente'] as const) {
      const { caso, ordenadas } = banco();
      const r = await caso.ejecutar(ctx(rol), orden);
      expect(r.ok, rol).toBe(false);
      expect(ordenadas, rol).toHaveLength(0);
    }
  });

  it('una copropiedad fuera del alcance tampoco acciona (RN-15)', async () => {
    const { caso, ordenadas } = banco();
    const r = await caso.ejecutar(ctx('administrador', 'otra-cop'), orden);
    expect(r.ok).toBe(false);
    expect(ordenadas).toHaveLength(0);
  });
});

describe('el estado queda con dueño y con fecha', () => {
  it('el rastro se escribe ANTES de accionar', async () => {
    const { caso, escritos } = banco();
    await caso.ejecutar(ctx('administrador'), orden);
    // Se escribió sin desenlace: prueba de que no se esperó a saber cómo
    // acababa para dejar constancia de quién lo pidió.
    expect(escritos).toHaveLength(1);
    expect(escritos[0]?.operadorId).toBe('admin-1');
    expect(escritos[0]?.rol).toBe('administrador');
    expect(escritos[0]?.desde.toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  it('el motivo queda NORMALIZADO, no como se tecleó', async () => {
    const { caso, escritos } = banco();
    await caso.ejecutar(ctx('administrador'), {
      ...orden,
      motivo: '  Mantenimiento    de la talanquera  ',
    });
    expect(escritos[0]?.motivo).toBe('Mantenimiento de la talanquera');
  });

  it('desbloquear es la misma orden con el estado contrario', async () => {
    const { caso, ordenadas } = banco();
    await caso.ejecutar(ctx('superadministrador'), { ...orden, bloqueado: false });
    expect(ordenadas).toEqual([{ dispositivoId: 'disp-1', bloqueado: false }]);
  });

  it('un equipo que no contesta deja el estado anotado como inalcanzable', async () => {
    // El bloqueo quedó pedido y registrado; lo que no se sabe es si prendió.
    // Esconderlo dejaría a la administración creyendo que el acceso está
    // bloqueado cuando quizá no lo esté.
    const { caso, escritos } = banco(ordenInalcanzable('El equipo no respondió en 3000 ms', 3000));
    const r = await caso.ejecutar(ctx('administrador'), orden);
    expect(r.ok && r.valor.resultado).toBe('inalcanzable');
    expect(escritos[0]?.resultado).toBe('inalcanzable');
    expect(escritos[0]?.detalle).toMatch(/3000 ms/);
  });
});
