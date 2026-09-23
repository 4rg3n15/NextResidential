import { describe, expect, it } from 'vitest';
import { booleano, entero, reemplazarEtiqueta } from './xml';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS LECTURAS QUE NUNCA DEVUELVEN UN VALOR INVENTADO
 *
 * Todo lo que sale de un equipo llega como texto, y este fichero es el único
 * sitio donde ese texto se convierte en algo con lo que se decide. Un `NaN` que
 * escapara de aquí acabaría comparado con un umbral —y toda comparación con
 * `NaN` es falsa, así que el umbral pasaría sin que nadie viera el fallo.
 */

describe('entero', () => {
  it('lee el número que trae el documento', () => {
    expect(entero('210')).toBe(210);
  });

  it('un texto que no es un número devuelve NULL, jamás `NaN`', () => {
    expect(entero('doscientos diez')).toBeNull();
  });

  it('y el infinito tampoco pasa: no es un valor de ningún campo', () => {
    expect(entero('Infinity')).toBeNull();
  });

  it('el campo ausente o vacío es null, que es distinto de cero', () => {
    expect(entero(null)).toBeNull();
    expect(entero('   ')).toBeNull();
  });
});

describe('booleano · el fabricante los escribe de cuatro formas', () => {
  it('las cuatro afirmativas', () => {
    for (const v of ['true', '1', 'yes', 'enable']) expect(booleano(v)).toBe(true);
  });

  it('las cuatro negativas', () => {
    for (const v of ['false', '0', 'no', 'disable']) expect(booleano(v)).toBe(false);
  });

  it('sin distinguir mayúsculas ni espacios, que es como vienen', () => {
    expect(booleano(' TRUE ')).toBe(true);
    expect(booleano('Disable')).toBe(false);
  });

  it('lo que no es ni una cosa ni otra es NULL: «no lo declara» no es «no»', () => {
    // Un campo ausente tratado como `false` daría por comprobado algo que este
    // firmware ni siquiera menciona.
    expect(booleano(null)).toBeNull();
    expect(booleano('quizá')).toBeNull();
  });
});

describe('reemplazarEtiqueta', () => {
  it('cambia el valor y deja el resto del documento intacto', () => {
    const r = reemplazarEtiqueta('<A><b>1</b><c>2</c></A>', 'b', '9');
    expect(r).toBe('<A><b>9</b><c>2</c></A>');
  });

  it('respeta el prefijo de espacio de nombres cuando el equipo lo usa', () => {
    expect(reemplazarEtiqueta('<ns:b>1</ns:b>', 'b', '9')).toBe('<ns:b>9</ns:b>');
  });

  it('si la etiqueta NO está devuelve null, y no la añade al final', () => {
    // Añadirla produciría un documento que el equipo rechaza por orden de
    // elementos, con un error que no dice eso.
    expect(reemplazarEtiqueta('<A><c>2</c></A>', 'b', '9')).toBeNull();
  });
});
