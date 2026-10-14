import { describe, expect, it } from 'vitest';
import { avisoDeAcceso } from './aviso-al-residente';

const UUID = '70000000-0000-4000-8000-000000000001';

describe('el aviso de acceso al residente (15-Z2, DT-15R-08)', () => {
  it('con nombre, lo dice; sin nombre, lo dice en palabras; nunca el identificador', () => {
    const base = { permitido: true, metodo: 'placa', motivo: null } as const;
    expect(avisoDeAcceso(base, 'Portería de A')).toEqual({
      titulo: 'Acceso registrado',
      cuerpo: 'Ingreso por placa en Portería de A.',
    });
    const sin = avisoDeAcceso(base, null);
    expect(sin.cuerpo).toBe('Ingreso por placa en un equipo sin nombre.');
    expect(JSON.stringify(sin)).not.toContain(UUID);
  });
  it('denegado: el motivo, y sin motivo lo dice', () => {
    expect(
      avisoDeAcceso({ permitido: false, metodo: 'placa', motivo: 'LISTA_NEGRA' }, 'X'),
    ).toEqual({
      titulo: 'Acceso denegado',
      cuerpo: 'Intento denegado (LISTA_NEGRA).',
    });
    expect(avisoDeAcceso({ permitido: false, metodo: 'placa', motivo: null }, null).cuerpo).toBe(
      'Intento denegado (sin motivo).',
    );
  });
});
