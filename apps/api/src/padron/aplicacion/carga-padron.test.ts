import { describe, expect, it, vi } from 'vitest';
import { CargarPadronDesdeArchivo, analizarCsv } from './carga-padron';
import type { RepositorioPadron } from './puertos';
import type { ContextoTenant } from '../../autenticacion';

const ctx: ContextoTenant = {
  usuarioId: 'u1',
  rol: 'administrador',
  copropiedadId: 'cop-1',
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

const repoFalso = (
  registrar = vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' }),
): RepositorioPadron => {
  const repo: RepositorioPadron = {
    registrarVehiculo: registrar,
    desactivarVehiculo: vi.fn().mockResolvedValue(true),
    registrarResidente: vi.fn().mockResolvedValue({ id: 'r1' }),
    desactivarVivienda: vi.fn().mockResolvedValue(true),
    contarVehiculosActivos: vi.fn().mockResolvedValue(0),
    enTransaccion: async (op) => op(repo),
  };
  return repo;
};

describe('analizador CSV', () => {
  it('lee cabeceras y celdas entrecomilladas', () => {
    const filas = analizarCsv('vivienda_id,placa\nviv-1,"ABC 123"\nviv-2,XYZ987\n');
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ numeroDeFila: 2, viviendaId: 'viv-1', placa: 'ABC 123' });
  });

  it('devuelve vacío si no hay filas de datos', () => {
    expect(analizarCsv('vivienda_id,placa\n')).toEqual([]);
    expect(analizarCsv('')).toEqual([]);
  });

  it('las comillas dobles escapadas no parten la celda', () => {
    const filas = analizarCsv('vivienda_id,placa\n"viv,1","AB""C12"\n');
    expect(filas[0]!.viviendaId).toBe('viv,1');
  });
});

describe('carga de padrón · todo o nada (HU-03)', () => {
  it('no escribe NADA si alguna fila es inválida', async () => {
    const registrar = vi.fn();
    const r = await new CargarPadronDesdeArchivo(repoFalso(registrar)).ejecutar(ctx, [
      { numeroDeFila: 2, viviendaId: 'viv-1', placa: 'ABC123' },
      { numeroDeFila: 3, viviendaId: 'viv-1', placa: 'no-vale-Ω' },
    ]);
    expect(r.aplicada).toBe(false);
    expect(r.aceptadas).toBe(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.numeroDeFila).toBe(3);
    // La clave: la fila 2 era válida y AUN ASÍ no se escribió.
    expect(registrar).not.toHaveBeenCalled();
  });

  it('aplica la carga completa cuando todas las filas son válidas', async () => {
    const r = await new CargarPadronDesdeArchivo(repoFalso()).ejecutar(ctx, [
      { numeroDeFila: 2, viviendaId: 'viv-1', placa: 'abc-123' },
      { numeroDeFila: 3, viviendaId: 'viv-2', personaId: 'p1', esTitular: true },
    ]);
    expect(r).toMatchObject({ aplicada: true, aceptadas: 2, errores: [] });
  });

  it('un choque de placa a mitad aborta la carga entera', async () => {
    const registrar = vi
      .fn()
      .mockResolvedValueOnce({ tipo: 'registrado', id: 'v1' })
      .mockResolvedValueOnce({ tipo: 'placa_activa_duplicada' });
    const r = await new CargarPadronDesdeArchivo(repoFalso(registrar)).ejecutar(ctx, [
      { numeroDeFila: 2, viviendaId: 'viv-1', placa: 'ABC123' },
      { numeroDeFila: 3, viviendaId: 'viv-1', placa: 'XYZ987' },
    ]);
    expect(r.aplicada).toBe(false);
    expect(r.aceptadas).toBe(0);
    expect(r.errores[0]!.numeroDeFila).toBe(3);
  });

  it('rechaza una fila que no aporta ni placa ni persona', async () => {
    const r = await new CargarPadronDesdeArchivo(repoFalso()).ejecutar(ctx, [
      { numeroDeFila: 2, viviendaId: 'viv-1' },
    ]);
    expect(r.aplicada).toBe(false);
    expect(r.errores[0]!.motivo).toMatch(/placa ni persona/);
  });

  it('rechaza vivienda_id vacío', async () => {
    const r = await new CargarPadronDesdeArchivo(repoFalso()).ejecutar(ctx, [
      { numeroDeFila: 2, viviendaId: '', placa: 'ABC123' },
    ]);
    expect(r.errores[0]!.motivo).toMatch(/vivienda_id/);
  });
});
