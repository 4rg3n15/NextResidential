import { describe, expect, it, vi } from 'vitest';
import { esFallo } from '@ncr/domain-core';
import { DesactivarVehiculo, DesactivarVivienda, RegistrarVehiculo } from './casos-de-uso';
import type { RepositorioPadron } from './puertos';
import type { ContextoTenant } from '../../autenticacion/dominio/claims';

const ctx: ContextoTenant = {
  usuarioId: 'u1',
  rol: 'administrador',
  copropiedadId: 'cop-1',
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};
/** Identidad de plataforma: superadministrador sin copropiedad propia. */
const sinTenant: ContextoTenant = { ...ctx, rol: 'superadministrador', copropiedadId: null };

const repo = (parcial: Partial<RepositorioPadron> = {}): RepositorioPadron => {
  const base: RepositorioPadron = {
    registrarVehiculo: vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' }),
    desactivarVehiculo: vi.fn().mockResolvedValue(true),
    registrarResidente: vi.fn().mockResolvedValue({ id: 'r1' }),
    desactivarVivienda: vi.fn().mockResolvedValue(true),
    contarVehiculosActivos: vi.fn().mockResolvedValue(0),
    enTransaccion: async (op) => op(base),
    ...parcial,
  };
  return base;
};

describe('RegistrarVehiculo', () => {
  it('normaliza la placa ANTES de llegar al repositorio', async () => {
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v9' });
    const r = await new RegistrarVehiculo(repo({ registrarVehiculo: registrar })).ejecutar(ctx, {
      viviendaId: 'viv-1',
      placa: ' abc-123 ',
    });
    expect(r.ok && r.valor.id).toBe('v9');
    // Si la normalización ocurriera después, el índice único compararía formas
    // distintas del mismo dato y RN-04 dejaría de sostenerse.
    expect(registrar.mock.calls[0]![0].placa.valor).toBe('ABC123');
  });

  it('rechaza una placa inválida sin tocar el repositorio', async () => {
    const registrar = vi.fn();
    const r = await new RegistrarVehiculo(repo({ registrarVehiculo: registrar })).ejecutar(ctx, {
      viviendaId: 'viv-1',
      placa: 'AB',
    });
    expect(esFallo(r)).toBe(true);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('traduce el choque del índice único a CONFLICTO_DE_CONCURRENCIA (ADR-04)', async () => {
    const r = await new RegistrarVehiculo(
      repo({ registrarVehiculo: vi.fn().mockResolvedValue({ tipo: 'placa_activa_duplicada' }) }),
    ).ejecutar(ctx, { viviendaId: 'viv-1', placa: 'ABC123' });
    expect(esFallo(r) && r.error.codigo).toBe('CONFLICTO_DE_CONCURRENCIA');
    expect(esFallo(r) && r.error.regla).toBe('RN-04');
  });

  it('una identidad sin copropiedad no puede registrar (RN-15)', async () => {
    const r = await new RegistrarVehiculo(repo()).ejecutar(sinTenant, {
      viviendaId: 'v',
      placa: 'ABC123',
    });
    expect(esFallo(r) && r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
  });

  it('propaga los campos opcionales tal cual, con null cuando faltan', async () => {
    const registrar = vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' });
    await new RegistrarVehiculo(repo({ registrarVehiculo: registrar })).ejecutar(ctx, {
      viviendaId: 'viv-1',
      placa: 'ABC123',
      marca: 'Mazda',
    });
    const alta = registrar.mock.calls[0]![0];
    expect(alta).toMatchObject({ marca: 'Mazda', modelo: null, color: null, personaId: null });
  });
});

describe('DesactivarVehiculo · RN-19', () => {
  it('exige motivo no vacío', async () => {
    const desactivar = vi.fn();
    for (const motivo of ['', '   ']) {
      const r = await new DesactivarVehiculo(repo({ desactivarVehiculo: desactivar })).ejecutar(
        ctx,
        'x1',
        motivo,
      );
      expect(esFallo(r) && r.error.regla).toBe('RN-19');
    }
    expect(desactivar).not.toHaveBeenCalled();
  });

  it('devuelve ENTIDAD_NO_ENCONTRADA si no había vehículo activo', async () => {
    const r = await new DesactivarVehiculo(
      repo({ desactivarVehiculo: vi.fn().mockResolvedValue(false) }),
    ).ejecutar(ctx, 'x1', 'vendido');
    expect(esFallo(r) && r.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });

  it('éxito cuando la baja se aplica', async () => {
    const r = await new DesactivarVehiculo(repo()).ejecutar(ctx, 'x1', 'vendido');
    expect(r.ok).toBe(true);
  });

  it('sin copropiedad en el contexto, no procede', async () => {
    const r = await new DesactivarVehiculo(repo()).ejecutar(sinTenant, 'x1', 'vendido');
    expect(esFallo(r) && r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
  });
});

describe('DesactivarVivienda · RN-19', () => {
  it('exige motivo, encuentra o no la vivienda, y respeta el tenant', async () => {
    const sinMotivo = await new DesactivarVivienda(repo()).ejecutar(ctx, 'viv-1', ' ');
    expect(esFallo(sinMotivo) && sinMotivo.error.regla).toBe('RN-19');

    const inexistente = await new DesactivarVivienda(
      repo({ desactivarVivienda: vi.fn().mockResolvedValue(false) }),
    ).ejecutar(ctx, 'viv-1', 'demolida');
    expect(esFallo(inexistente) && inexistente.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');

    expect((await new DesactivarVivienda(repo()).ejecutar(ctx, 'viv-1', 'demolida')).ok).toBe(true);

    const sinCop = await new DesactivarVivienda(repo()).ejecutar(sinTenant, 'viv-1', 'demolida');
    expect(esFallo(sinCop) && sinCop.error.codigo).toBe('OPERACION_NO_PERMITIDA');
  });
});
