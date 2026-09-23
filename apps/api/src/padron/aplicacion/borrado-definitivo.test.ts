import { describe, expect, it, vi } from 'vitest';
import { BorrarViviendaDefinitivamente, ReactivarVivienda } from './casos-de-uso';
import type { RepositorioPadron } from './puertos';
import type { ContextoTenant } from '../../autenticacion';

/**
 * B.2 · BORRADO DEFINITIVO Y REACTIVACIÓN
 *
 * El choque es real: RN-19 prohíbe el borrado físico **donde hay historial**, y
 * la baja lógica cubre bien ese caso. Lo que no cubría es «la creé por error
 * hace un minuto», y obligar a arrastrarla desactivada para siempre convierte
 * una regla de trazabilidad en un estorbo — que es como se aprende a
 * desconfiar de las reglas.
 *
 * Aquí se prueba la decisión y el MENSAJE. La garantía de que no se puede
 * saltar vive en la base (disparador de la migración 0032, que alcanza también
 * al dueño de la tabla) y se prueba en `supabase/policies/tests/70_…`.
 */
const ctx: ContextoTenant = {
  usuarioId: '00000000-0000-4000-8000-000000000010',
  rol: 'administrador',
  copropiedadId: '10000000-0000-4000-8000-000000000001',
  copropiedadesAtendidas: [],
} as unknown as ContextoTenant;

const repo = (parcial: Partial<RepositorioPadron>): RepositorioPadron =>
  ({
    historialDeVivienda: vi.fn(),
    borrarViviendaDefinitivamente: vi.fn(),
    reactivarVivienda: vi.fn(),
    ...parcial,
  }) as unknown as RepositorioPadron;

const SIN_HISTORIAL = {
  identificador: '999',
  residentes: 0,
  vehiculos: 0,
  autorizaciones: 0,
  eventos: 0,
};

describe('sin historial se borra, y la respuesta nombra lo borrado', () => {
  it('borra y devuelve el identificador', async () => {
    const borrar = vi.fn().mockResolvedValue({ borrada: true });
    const r = await new BorrarViviendaDefinitivamente(
      repo({
        historialDeVivienda: vi.fn().mockResolvedValue(SIN_HISTORIAL),
        borrarViviendaDefinitivamente: borrar,
      }),
    ).ejecutar(ctx, 'viv-1');

    expect(r.ok && r.valor.identificador).toBe('999');
    expect(borrar).toHaveBeenCalledOnce();
  });
});

describe('con historial NO se borra, y se dice QUÉ lo impide', () => {
  it('nombra cada clase con su recuento', async () => {
    const borrar = vi.fn();
    const r = await new BorrarViviendaDefinitivamente(
      repo({
        historialDeVivienda: vi.fn().mockResolvedValue({
          identificador: '42',
          residentes: 3,
          vehiculos: 1,
          autorizaciones: 0,
          eventos: 128,
        }),
        borrarViviendaDefinitivamente: borrar,
      }),
    ).ejecutar(ctx, 'viv-42');

    expect(r.ok).toBe(false);
    const detalle = r.ok ? '' : r.error.detalle;
    expect(detalle).toContain('3 residente(s)');
    expect(detalle).toContain('1 vehículo(s)');
    expect(detalle).toContain('128 evento(s)');
    // Lo que NO tiene no se menciona: una lista con ceros obliga a leer para
    // descubrir que sobra la mitad.
    expect(detalle).not.toContain('autorización');
    // Y sobre todo: no se llegó a intentar el borrado.
    expect(borrar).not.toHaveBeenCalled();
  });

  it('UN SOLO evento basta: es la trazabilidad de un acceso (RN-03)', async () => {
    const r = await new BorrarViviendaDefinitivamente(
      repo({
        historialDeVivienda: vi
          .fn()
          .mockResolvedValue({ ...SIN_HISTORIAL, identificador: '7', eventos: 1 }),
      }),
    ).ejecutar(ctx, 'viv-7');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.detalle).toContain('1 evento(s)');
  });

  it('la negativa de la BASE también se traduce, no se convierte en un 500', async () => {
    // El historial pudo aparecer entre la lectura y el borrado. La última
    // palabra es de la base, y su motivo llega tal cual al usuario.
    const r = await new BorrarViviendaDefinitivamente(
      repo({
        historialDeVivienda: vi.fn().mockResolvedValue(SIN_HISTORIAL),
        borrarViviendaDefinitivamente: vi
          .fn()
          .mockResolvedValue({ borrada: false, motivo: 'La vivienda 999 tiene historial' }),
      }),
    ).ejecutar(ctx, 'viv-1');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.detalle).toContain('tiene historial');
  });
});

describe('la vivienda que no existe no se confunde con la que no se puede borrar', () => {
  it('devuelve «no encontrada», no «tiene historial»', async () => {
    const r = await new BorrarViviendaDefinitivamente(
      repo({ historialDeVivienda: vi.fn().mockResolvedValue(null) }),
    ).ejecutar(ctx, 'viv-x');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });
});

describe('reactivación', () => {
  it('vuelve a poner en servicio una vivienda inactiva', async () => {
    const r = await new ReactivarVivienda(
      repo({ reactivarVivienda: vi.fn().mockResolvedValue(true) }),
    ).ejecutar(ctx, 'viv-1');
    expect(r.ok).toBe(true);
  });

  it('reactivar una que ya está activa no es un éxito silencioso', async () => {
    const r = await new ReactivarVivienda(
      repo({ reactivarVivienda: vi.fn().mockResolvedValue(false) }),
    ).ejecutar(ctx, 'viv-1');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });

  it('una identidad sin copropiedad no reactiva nada (RN-15)', async () => {
    const reactivar = vi.fn();
    const r = await new ReactivarVivienda(repo({ reactivarVivienda: reactivar })).ejecutar(
      { ...ctx, copropiedadId: null } as ContextoTenant,
      'viv-1',
    );
    expect(r.ok).toBe(false);
    expect(reactivar).not.toHaveBeenCalled();
  });
});
