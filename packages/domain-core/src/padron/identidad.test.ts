import { describe, expect, it } from 'vitest';
import { identidadCoincide } from './persona';

/** D-10 · el titular escribe su identidad; se compara con la del padrón. */
const REGISTRADA = { nombreCompleto: 'José Ángel Pérez Núñez', numeroDocumento: '12345678' };

describe('D-10 · identidadCoincide', () => {
  it('coincide aunque se escriba sin tildes, en mayúsculas y con puntos en la cédula', () => {
    expect(
      identidadCoincide(
        { nombreCompleto: '  JOSE  angel perez nuñez ', numeroDocumento: '12.345.678' },
        REGISTRADA,
      ),
    ).toBe(true);
  });

  it('otro documento NO coincide, aunque el nombre sí', () => {
    expect(identidadCoincide({ ...REGISTRADA, numeroDocumento: '12345679' }, REGISTRADA)).toBe(
      false,
    );
  });

  it('otro nombre NO coincide, aunque el documento sí', () => {
    expect(identidadCoincide({ ...REGISTRADA, nombreCompleto: 'José Pérez' }, REGISTRADA)).toBe(
      false,
    );
  });

  it('un documento ilegible o un nombre vacío nunca coinciden', () => {
    expect(identidadCoincide({ ...REGISTRADA, numeroDocumento: '¿?' }, REGISTRADA)).toBe(false);
    expect(identidadCoincide({ ...REGISTRADA, nombreCompleto: ' - ' }, REGISTRADA)).toBe(false);
  });
});
