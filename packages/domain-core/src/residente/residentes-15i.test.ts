import { describe, expect, it } from 'vitest';
import { explicacionDeVehiculo, validarVehiculoPropio } from './vehiculo-propio';
import type { MotivoDeNoRegistrarVehiculo } from './vehiculo-propio';
import { normalizarDocumento, validarPerfil } from './perfil';

describe('vehículo propio (D5 a)', () => {
  const ok = {
    placa: 'abc-123',
    color: ' Gris ',
    modelo: 'Mazda 3',
    marca: null,
    tipo: 'automovil',
    ocupantes: ['r1', 'r1', 'r2'],
  };
  it('normaliza la placa, sanea el texto y quita ocupantes repetidos', () => {
    const r = validarVehiculoPropio(ok, ['r1', 'r2']);
    expect(r.ok && r.valor).toMatchObject({
      placa: 'ABC123',
      color: 'Gris',
      ocupantes: ['r1', 'r2'],
    });
  });
  it('uno o más ocupantes, y todos de la vivienda', () => {
    expect(validarVehiculoPropio({ ...ok, ocupantes: [] }, ['r1'])).toMatchObject({
      ok: false,
      error: { motivo: 'SIN_OCUPANTES' },
    });
    expect(validarVehiculoPropio(ok, ['r1'])).toMatchObject({
      ok: false,
      error: { motivo: 'OCUPANTE_AJENO' },
    });
  });
  it('placa, color, modelo y tipo inválidos se rechazan como datos', () => {
    for (const malo of [
      { ...ok, placa: 'A' },
      { ...ok, color: '   ' },
      { ...ok, tipo: 'tanque' },
    ]) {
      expect(validarVehiculoPropio(malo, ['r1', 'r2'])).toMatchObject({
        ok: false,
        error: { motivo: 'DATOS_INVALIDOS' },
      });
    }
    const conMarca = validarVehiculoPropio({ ...ok, marca: 'Mazda' }, ['r1', 'r2']);
    expect(conMarca.ok && conMarca.valor.marca).toBe('Mazda');
  });
  it('el tope se explica diciendo a quién pedir el siguiente', () => {
    expect(explicacionDeVehiculo('TOPE_ALCANZADO', 2)).toContain('superadministrador');
    expect(explicacionDeVehiculo('TOPE_ALCANZADO')).toContain('máximo');
    const motivos: MotivoDeNoRegistrarVehiculo[] = [
      'PLACA_DUPLICADA',
      'VIVIENDA_INACTIVA',
      'OCUPANTE_AJENO',
      'SIN_OCUPANTES',
      'DATOS_INVALIDOS',
    ];
    for (const m of motivos) expect(explicacionDeVehiculo(m).length).toBeGreaterThan(10);
  });
});

describe('perfil del residente (3.5)', () => {
  const hoy = new Date('2026-09-26T12:00:00Z');
  const datos = {
    nombres: ' Ana ',
    apellidos: 'Pérez',
    fechaNacimiento: '1990-05-17',
    tipoDocumento: 'cedula',
    numeroDocumento: '52.123.456',
    correo: 'Ana@Correo.invalid',
    telefono: '+57 300 111 2233',
  };
  it('sanea y normaliza: documento, correo en minúsculas y teléfono sin espacios', () => {
    const r = validarPerfil(datos, hoy);
    expect(r.ok && r.valor).toMatchObject({
      nombres: 'Ana',
      numeroDocumento: '52123456',
      correo: 'ana@correo.invalid',
      telefono: '+573001112233',
    });
    expect(normalizarDocumento('ab-12 34')).toBe('AB1234');
  });
  it('devuelve TODOS los campos malos de una vez, sin el valor del documento', () => {
    const r = validarPerfil(
      {
        ...datos,
        nombres: '',
        apellidos: 'x'.repeat(101),
        correo: 'no',
        telefono: '12',
        tipoDocumento: 'dni',
        numeroDocumento: '1',
      },
      hoy,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.map((c) => c.campo).sort()).toEqual(
        ['apellidos', 'correo', 'nombres', 'numeroDocumento', 'telefono', 'tipoDocumento'].sort(),
      );
      expect(JSON.stringify(r.error)).not.toContain('"1"');
    }
  });
  it('la fecha: formato, que exista, desde 1900 y nunca futura (reloj inyectado)', () => {
    for (const [f, esperado] of [
      ['17/05/1990', 'AAAA-MM-DD'],
      ['1990-02-30', 'no existe'],
      ['1899-12-31', '1900'],
      ['2026-09-27', 'futura'],
    ] as const) {
      const r = validarPerfil({ ...datos, fechaNacimiento: f }, hoy);
      expect(!r.ok && r.error[0]?.motivo).toContain(esperado);
    }
    expect(validarPerfil({ ...datos, fechaNacimiento: null }, hoy).ok).toBe(true);
  });
});
