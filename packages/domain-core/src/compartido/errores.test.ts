import { describe, expect, it } from 'vitest';
import { MOTIVOS_ACCESO, errorDominio, nuncaOcurre } from './errores';

describe('errores del dominio', () => {
  it('la enumeración de motivos es la del contrato §2.4, con FUERA_DE_HORARIO (D-18)', () => {
    expect(MOTIVOS_ACCESO).toHaveLength(10);
    expect(MOTIVOS_ACCESO).toContain('FUERA_DE_HORARIO');
    expect(new Set(MOTIVOS_ACCESO).size).toBe(MOTIVOS_ACCESO.length);
  });

  it('errorDominio omite `regla` cuando no se aporta', () => {
    expect(errorDominio('DATO_INVALIDO', 'x')).toEqual({ codigo: 'DATO_INVALIDO', detalle: 'x' });
    expect(errorDominio('INVARIANTE_VIOLADA', 'y', 'RN-04')).toEqual({
      codigo: 'INVARIANTE_VIOLADA',
      detalle: 'y',
      regla: 'RN-04',
    });
  });

  it('nuncaOcurre lanza si se alcanza en ejecución', () => {
    expect(() => nuncaOcurre('inesperado' as never)).toThrow(/Caso no cubierto/);
    expect(() => nuncaOcurre('x' as never, 'Motivo')).toThrow(/Motivo/);
  });
});
