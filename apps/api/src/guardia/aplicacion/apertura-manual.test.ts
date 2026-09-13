import { describe, expect, it } from 'vitest';
import { AccionarPuertaAMano, motivoValido } from './apertura-manual';
import type { AccionadorDePuerta, BitacoraDeOrdenes, OrdenEjecutada } from './apertura-manual';
import type { ContextoTenant } from '../../autenticacion';

/**
 * RN-08 · CA-16 · CA-17 — **sin motivo no se acciona la puerta**.
 *
 * La comprobación que importa no es que el formulario exija el campo: es que la
 * orden NO llegue al relé. Estas pruebas miran el accionador, no la respuesta.
 */
const COP = 'cop-a';

const ctx = (rol: ContextoTenant['rol'], copropiedadId: string | null = COP): ContextoTenant =>
  ({
    rol,
    usuarioId: 'op-1',
    copropiedadId,
    copropiedadesAtendidas: [],
    mfaVerificado: true,
  }) as unknown as ContextoTenant;

const banco = () => {
  const accionadas: { dispositivoId: string; abrir: boolean }[] = [];
  const registradas: OrdenEjecutada[] = [];
  const accionador: AccionadorDePuerta = {
    accionar: async (dispositivoId, abrir) => {
      accionadas.push({ dispositivoId, abrir });
    },
  };
  const bitacora: BitacoraDeOrdenes = {
    registrar: async (o) => {
      registradas.push(o);
    },
    ultimas: async () => registradas,
  };
  const caso = new AccionarPuertaAMano(
    accionador,
    bitacora,
    {
      ahora: () => new Date(Date.UTC(2026, 8, 13, 9, 0, 0)),
    },
    { nuevo: () => 'orden-1' },
  );
  return { caso, accionadas, registradas };
};

describe('el motivo como condición, no como campo', () => {
  it('sin motivo la puerta NO se acciona', () => {
    // Se mira el accionador. Un caso de uso que devolviera error y hubiera
    // llamado al relé igualmente pasaría cualquier prueba sobre la respuesta.
    const { caso, accionadas } = banco();
    return caso
      .ejecutar(ctx('portero'), {
        copropiedadId: COP,
        dispositivoId: 'disp-1',
        accion: 'abrir',
        motivo: '',
      })
      .then((r) => {
        expect(r.ok).toBe(false);
        expect(accionadas).toHaveLength(0);
      });
  });

  it('un motivo de sólo espacios tampoco vale', () => {
    expect(motivoValido('            ').ok).toBe(false);
  });

  it('un motivo demasiado corto tampoco: es un formulario rellenado para pasar', () => {
    expect(motivoValido('ok').ok).toBe(false);
  });

  it('se normaliza y se acota antes de guardarse', () => {
    const r = motivoValido('  Visitante   esperado  por   la  vivienda 4  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe('Visitante esperado por la vivienda 4');
  });

  it('un motivo enorme se rechaza', () => {
    expect(motivoValido('x'.repeat(400)).ok).toBe(false);
  });
});

describe('con motivo, se acciona y queda constancia', () => {
  it('abre, y el rastro se escribe ANTES de tocar el relé', async () => {
    const { caso, accionadas, registradas } = banco();
    const r = await caso.ejecutar(ctx('portero'), {
      copropiedadId: COP,
      dispositivoId: 'disp-1',
      accion: 'abrir',
      motivo: 'Visitante esperado por la vivienda 4',
    });
    expect(r.ok).toBe(true);
    expect(accionadas).toEqual([{ dispositivoId: 'disp-1', abrir: true }]);
    // Al revés, una caída entre accionar y registrar dejaría una puerta
    // abierta sin constancia — el peor de los dos estados posibles.
    expect(registradas).toHaveLength(1);
    expect(registradas[0]?.operadorId).toBe('op-1');
  });

  it('NEGAR también deja evento, aunque «no pasara nada» (RN-02)', async () => {
    const { caso, accionadas, registradas } = banco();
    const r = await caso.ejecutar(ctx('portero'), {
      copropiedadId: COP,
      dispositivoId: 'disp-1',
      accion: 'negar',
      motivo: 'No figura en la autorización de la vivienda',
    });
    expect(r.ok).toBe(true);
    expect(accionadas).toHaveLength(0);
    expect(registradas[0]?.accion).toBe('negar');
  });
});

describe('quién puede accionar', () => {
  it('el residente no acciona puertas', async () => {
    const { caso, accionadas } = banco();
    const r = await caso.ejecutar(ctx('residente'), {
      copropiedadId: COP,
      dispositivoId: 'disp-1',
      accion: 'abrir',
      motivo: 'Quiero entrar a mi propia casa',
    });
    expect(r.ok).toBe(false);
    expect(accionadas).toHaveLength(0);
  });

  it('un portero de OTRA copropiedad tampoco', async () => {
    const { caso, accionadas } = banco();
    const r = await caso.ejecutar(ctx('portero', 'cop-b'), {
      copropiedadId: COP,
      dispositivoId: 'disp-1',
      accion: 'abrir',
      motivo: 'Abriendo una puerta que no es mía',
    });
    expect(r.ok).toBe(false);
    expect(accionadas).toHaveLength(0);
  });
});
