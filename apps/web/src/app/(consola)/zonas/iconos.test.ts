import { describe, expect, it } from 'vitest';
import { ICONO_NEUTRO, ICONOS_DE_ZONA, OPCIONES_DE_ICONO, iconoDeZona } from './iconos';

describe('iconos de zona (O3)', () => {
  it('todo nombre del catálogo cumple la forma que la API exige', () => {
    for (const nombre of Object.keys(ICONOS_DE_ZONA)) {
      expect(nombre).toMatch(/^[a-z0-9-]{1,40}$/);
    }
    expect(OPCIONES_DE_ICONO.length).toBe(Object.keys(ICONOS_DE_ZONA).length);
  });

  it('un nombre desconocido o nulo cae al icono neutro en vez de romper la tarjeta', () => {
    expect(iconoDeZona(null)).toBe(ICONO_NEUTRO);
    expect(iconoDeZona(undefined)).toBe(ICONO_NEUTRO);
    expect(iconoDeZona('inventado')).toBe(ICONO_NEUTRO);
    expect(iconoDeZona('waves')).toBe(ICONOS_DE_ZONA.waves?.icono);
  });
});
