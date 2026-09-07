import { describe, expect, it } from 'vitest';
import { Vivienda } from './vivienda';
import { Placa } from './placa';
import { esExito, esFallo } from '../compartido/resultado';

const placa = (v: string): Placa => {
  const r = Placa.crear(v);
  if (!esExito(r)) throw new Error('placa de prueba inválida');
  return r.valor;
};

const nueva = (estado: 'activo' | 'inactivo' = 'activo'): Vivienda =>
  Vivienda.reconstituir({
    id: 'viv-1',
    copropiedadId: 'cop-1',
    identificador: 'Casa 42',
    estado,
    estadoAdministrativo: 'al_dia',
  });

describe('agregado Vivienda', () => {
  it('la baja es lógica y exige motivo (RN-19, CA-02)', () => {
    const v = nueva();
    expect(esFallo(v.desactivar('   '))).toBe(true);
    expect(v.activa).toBe(true);
    expect(esExito(v.desactivar('vendida'))).toBe(true);
    expect(v.estado).toBe('inactivo');
    // No hay borrado: el agregado sigue existiendo con su historial.
    expect(esFallo(v.desactivar('otra vez'))).toBe(true);
  });

  it('RN-13 · inactiva no genera autorizaciones nuevas', () => {
    const v = nueva();
    expect(v.puedeGenerarAutorizaciones()).toBe(true);
    v.desactivar('en obra');
    expect(v.puedeGenerarAutorizaciones()).toBe(false);
  });

  it('no admite altas en una vivienda inactiva (RN-13)', () => {
    const v = nueva('inactivo');
    expect(
      esFallo(
        v.agregarResidente({ id: 'r1', personaId: 'p1', esTitular: false, estado: 'activo' }),
      ),
    ).toBe(true);
    expect(
      esFallo(
        v.registrarVehiculo({
          id: 'x1',
          placa: placa('ABC123'),
          personaId: null,
          estado: 'activo',
        }),
      ),
    ).toBe(true);
  });

  it('KPI-01 · una persona no se duplica como residente activo', () => {
    const v = nueva();
    expect(
      esExito(v.agregarResidente({ id: 'r1', personaId: 'p1', esTitular: true, estado: 'activo' })),
    ).toBe(true);
    expect(
      esFallo(
        v.agregarResidente({ id: 'r2', personaId: 'p1', esTitular: false, estado: 'activo' }),
      ),
    ).toBe(true);
  });

  it('admite VARIOS titulares activos (S-15, resuelto por el cliente)', () => {
    // Dos propietarios de la misma casa, ambos autorizando visitas: el caso
    // habitual en copropiedades colombianas. El singular de CU-01 describe a
    // quién se contacta en ese flujo, no el modelo del padrón.
    const v = nueva();
    expect(
      esExito(v.agregarResidente({ id: 'r1', personaId: 'p1', esTitular: true, estado: 'activo' })),
    ).toBe(true);
    expect(
      esExito(v.agregarResidente({ id: 'r2', personaId: 'p2', esTitular: true, estado: 'activo' })),
    ).toBe(true);
    expect(
      esExito(
        v.agregarResidente({ id: 'r3', personaId: 'p3', esTitular: false, estado: 'activo' }),
      ),
    ).toBe(true);
    expect(v.titularesActivos).toHaveLength(2);
  });

  it('un titular dado de baja deja de contar como titular activo', () => {
    const v = nueva();
    v.agregarResidente({ id: 'r1', personaId: 'p1', esTitular: true, estado: 'activo' });
    v.agregarResidente({ id: 'r2', personaId: 'p2', esTitular: true, estado: 'activo' });
    v.desactivarResidente('r1', 'vendio su parte');
    expect(v.titularesActivos.map((r) => r.id)).toEqual(['r2']);
  });

  it('rechaza placa ya activa en la vivienda, y la acepta tras la baja', () => {
    const v = nueva();
    expect(
      esExito(
        v.registrarVehiculo({
          id: 'x1',
          placa: placa('abc-123'),
          personaId: null,
          estado: 'activo',
        }),
      ),
    ).toBe(true);
    // Escrita distinto, mismo coche: lo detecta porque compara VOs, no strings.
    expect(
      esFallo(
        v.registrarVehiculo({
          id: 'x2',
          placa: placa('ABC 123'),
          personaId: null,
          estado: 'activo',
        }),
      ),
    ).toBe(true);
    expect(esExito(v.desactivarVehiculo('x1', 'vendido'))).toBe(true);
    expect(
      esExito(
        v.registrarVehiculo({
          id: 'x3',
          placa: placa('ABC123'),
          personaId: null,
          estado: 'activo',
        }),
      ),
    ).toBe(true);
  });

  it('las bajas de residente y vehículo exigen motivo y no repiten', () => {
    const v = nueva();
    v.agregarResidente({ id: 'r1', personaId: 'p1', esTitular: false, estado: 'activo' });
    v.registrarVehiculo({ id: 'x1', placa: placa('XYZ987'), personaId: null, estado: 'activo' });
    expect(esFallo(v.desactivarResidente('r1', ''))).toBe(true);
    expect(esFallo(v.desactivarVehiculo('x1', ' '))).toBe(true);
    expect(esExito(v.desactivarResidente('r1', 'se mudó'))).toBe(true);
    expect(esFallo(v.desactivarResidente('r1', 'otra vez'))).toBe(true);
    expect(esFallo(v.desactivarResidente('inexistente', 'x'))).toBe(true);
    expect(esFallo(v.desactivarVehiculo('inexistente', 'x'))).toBe(true);
    expect(v.vehiculos).toHaveLength(1);
    expect(esExito(v.desactivarVehiculo('x1', 'vendido'))).toBe(true);
    // Sin borrado físico: el vehículo sigue en el agregado, inactivo (RN-19).
    expect(v.vehiculos).toHaveLength(1);
    expect(esFallo(v.desactivarVehiculo('x1', 'otra vez'))).toBe(true);
  });
});
