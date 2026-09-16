import { describe, expect, it } from 'vitest';
import { empiezaPorEtiqueta, nombreDeVivienda, recortarEtiqueta } from './etiquetas';

describe('la palabra se detecta escrita como sea', () => {
  it('con espacio, con guion y sin tildes', () => {
    expect(recortarEtiqueta('Casa 42', 'Casa')).toBe('42');
    expect(recortarEtiqueta('casa-42', 'Casa')).toBe('42');
    expect(recortarEtiqueta('SECCION 3', 'Sección')).toBe('3');
  });

  it('un identificador que solo es la palabra NO se recorta a vacío', () => {
    // Devolver '' lo haría pasar por válido, y una vivienda sin número es
    // justo lo que hay que corregir.
    expect(recortarEtiqueta('Casa', 'Casa')).toBeNull();
    expect(recortarEtiqueta('Casa   ', 'Casa')).toBeNull();
  });

  it('«Casablanca» no empieza por «Casa»: hace falta separador', () => {
    expect(empiezaPorEtiqueta('Casablanca', 'Casa')).toBe(false);
    expect(recortarEtiqueta('Casablanca', 'Casa')).toBeNull();
  });

  it('lo que no lleva la palabra se deja como está', () => {
    expect(recortarEtiqueta('42', 'Casa')).toBeNull();
    expect(recortarEtiqueta('101', 'Apartamento')).toBeNull();
  });

  it('una etiqueta vacía no recorta nada: si no, se comería el identificador', () => {
    expect(recortarEtiqueta('42', '')).toBeNull();
  });
});

describe('el nombre visible se COMPONE, nunca se guarda', () => {
  it('con agrupación y sin ella', () => {
    expect(nombreDeVivienda('Casa', '42', 'Manzana', 'B')).toBe('Casa 42 · Manzana B');
    expect(nombreDeVivienda('Finca', '7')).toBe('Finca 7');
    expect(nombreDeVivienda('Casa', '42', 'Manzana', null)).toBe('Casa 42');
    expect(nombreDeVivienda('Casa', '42', 'Manzana', '   ')).toBe('Casa 42');
  });

  it('cambiar la etiqueta cambia el nombre sin tocar el identificador', () => {
    expect(nombreDeVivienda('Apartamento', '101', 'Torre', '1')).toBe('Apartamento 101 · Torre 1');
  });
});
