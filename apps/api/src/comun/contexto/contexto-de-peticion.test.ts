import { describe, expect, it } from 'vitest';
import {
  conContexto,
  contextoActual,
  correlacionActual,
  correlacionAdmisible,
} from './contexto-de-peticion';

describe('correlacionAdmisible', () => {
  it('acepta una etiqueta razonable', () => {
    expect(correlacionAdmisible('9f3a-11ee.abc_1')).toBe('9f3a-11ee.abc_1');
    expect(correlacionAdmisible('  con-espacios-fuera  ')).toBe('con-espacios-fuera');
  });

  it('rechaza lo que partiría una línea de registro en dos', () => {
    // Inyección de registro: un salto de línea dentro del identificador
    // convierte una entrada en dos, y la segunda la escribe quien llama.
    expect(correlacionAdmisible('abc\n{"nivel":"info"}')).toBeNull();
    expect(correlacionAdmisible('abc\rdef')).toBeNull();
    expect(correlacionAdmisible('abc def')).toBeNull();
    expect(correlacionAdmisible('"comillas"')).toBeNull();
  });

  it('DESCARTA entero en vez de truncar', () => {
    // Truncar dejaría pasar el prefijo que eligió quien llama, que es la mitad
    // del problema: podría hacerse pasar por la traza de otro.
    expect(correlacionAdmisible('a'.repeat(129))).toBeNull();
    expect(correlacionAdmisible('a'.repeat(128))).toBe('a'.repeat(128));
  });

  it('rechaza lo que no es texto y lo vacío', () => {
    expect(correlacionAdmisible(undefined)).toBeNull();
    expect(correlacionAdmisible(['a', 'b'])).toBeNull();
    expect(correlacionAdmisible(42)).toBeNull();
    expect(correlacionAdmisible('   ')).toBeNull();
  });
});

describe('contexto de petición', () => {
  it('fuera de una petición no hay contexto, y su ausencia es información', () => {
    expect(contextoActual()).toBeUndefined();
    expect(correlacionActual()).toBeUndefined();
  });

  it('propaga a través de `await`, que es para lo que existe', async () => {
    const visto = await conContexto({ correlacion: 'traza-1' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      await Promise.resolve();
      return correlacionActual();
    });
    expect(visto).toBe('traza-1');
  });

  it('dos peticiones simultáneas no se mezclan', async () => {
    const [a, b] = await Promise.all([
      conContexto({ correlacion: 'A' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return correlacionActual();
      }),
      conContexto({ correlacion: 'B' }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return correlacionActual();
      }),
    ]);
    expect([a, b]).toEqual(['A', 'B']);
  });

  it('el contexto lleva ruta y método cuando los hay', () => {
    conContexto({ correlacion: 'c', metodo: 'POST', ruta: '/ingesta/eventos' }, () => {
      expect(contextoActual()).toEqual({
        correlacion: 'c',
        metodo: 'POST',
        ruta: '/ingesta/eventos',
      });
    });
  });
});
