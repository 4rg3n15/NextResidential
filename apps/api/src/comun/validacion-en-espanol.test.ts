import { describe, expect, it } from 'vitest';
import type { ValidationError } from '@nestjs/common';
import { PROFUNDIDAD_MAXIMA, camposRechazados, rechazoDeForma } from './validacion-en-espanol';

const error = (
  property: string,
  constraints?: Record<string, string>,
  children?: ValidationError[],
): ValidationError => ({
  property,
  ...(constraints === undefined ? {} : { constraints }),
  ...(children === undefined ? {} : { children }),
  target: { secreto: 'nunca sale' },
  value: 'valor recibido',
});

describe('los 400 de forma en español (15-Z2, DT-15W-05)', () => {
  it('traduce cada restricción a un motivo corto, sin lo interno', () => {
    const e = rechazoDeForma([
      error('placa', { isString: 'placa must be a string' }),
      error('extra', { whitelistValidation: 'property extra should not exist' }),
      error('cantidad', { min: 'cantidad must not be less than 1', isInt: '...' }),
      error('raro', { unaRestriccionDesconocida: 'raro must satisfy something' }),
    ]);
    expect(e.getStatus()).toBe(400);
    const cuerpo = e.getResponse() as { message: string; campos: unknown };
    expect(cuerpo.campos).toEqual([
      { campo: 'placa', motivo: 'debe ser texto' },
      { campo: 'extra', motivo: 'no se admite este campo' },
      { campo: 'cantidad', motivo: 'es menor que lo admitido' },
      { campo: 'raro', motivo: 'no es válido' },
    ]);
    expect(cuerpo.message).toBe(
      'Revise los datos: placa debe ser texto; extra no se admite este campo; ' +
        'cantidad es menor que lo admitido; raro no es válido',
    );
    const texto = JSON.stringify(cuerpo);
    for (const interno of [
      'must be',
      'should not exist',
      'valor recibido',
      'nunca sale',
      'isString',
    ]) {
      expect(texto).not.toContain(interno);
    }
  });

  it('un mensaje propio del DTO, ya en español, se respeta; el inglés por omisión no', () => {
    expect(
      camposRechazados([
        error('aceptaPolitica', { isBoolean: 'debe aceptar la política del rostro' }),
        error('motivo', { minLength: 'El motivo tiene al menos 5 caracteres' }),
        error('placa', { isString: 'placa must be a string' }),
        error('ocupantes', { arrayMinSize: 'ocupantes must contain at least 1 elements' }),
      ]),
    ).toEqual([
      { campo: 'aceptaPolitica', motivo: 'debe aceptar la política del rostro' },
      { campo: 'motivo', motivo: 'El motivo tiene al menos 5 caracteres' },
      { campo: 'placa', motivo: 'debe ser texto' },
      { campo: 'ocupantes', motivo: 'tiene menos elementos de los necesarios' },
    ]);
  });

  it('los campos anidados y las listas llevan su ruta', () => {
    expect(
      camposRechazados([
        error('ocupantes', undefined, [
          error('1', undefined, [
            error('documento', { isNotEmpty: 'documento should not be empty' }),
          ]),
        ]),
      ]),
    ).toEqual([{ campo: 'ocupantes.1.documento', motivo: 'es obligatorio' }]);
  });

  it('la recursión está acotada: más allá de la profundidad máxima no se baja', () => {
    let hoja = error('fondo', { isString: 'fondo must be a string' });
    for (let i = 0; i < PROFUNDIDAD_MAXIMA + 3; i += 1)
      hoja = error(`n${String(i)}`, undefined, [hoja]);
    expect(camposRechazados([hoja])).toEqual([]);
  });

  it('sin errores por campo, sólo el resumen', () => {
    const cuerpo = rechazoDeForma([]).getResponse() as { message: string; campos: unknown[] };
    expect(cuerpo).toEqual({ message: 'Revise los datos', campos: [] });
  });
});
