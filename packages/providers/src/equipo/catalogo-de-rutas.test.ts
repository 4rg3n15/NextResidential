import { describe, expect, it } from 'vitest';
import { RUTAS, rutaPara, rutasDeFamilia, rutasPor } from './catalogo-de-rutas';

/**
 * El catálogo no se prueba «por probar algo»: lo que se fija aquí es la regla
 * del repositorio —ninguna ruta sin etiqueta de procedencia— en una forma que
 * rompe el día que alguien añada una a medias.
 */
describe('catálogo de rutas', () => {
  it('NINGUNA ruta se queda sin procedencia ni sin fuente', () => {
    for (const r of RUTAS) {
      expect(r.procedencia, `${r.proposito}: sin procedencia`).toMatch(
        /^(verificada|documentada)$/,
      );
      expect(r.fuente.length, `${r.proposito}: la fuente está vacía`).toBeGreaterThan(20);
    }
  });

  it('toda ruta DOCUMENTADA dice qué comprobar en sitio para ascenderla', () => {
    // Una etiqueta «pendiente de verificar» sin decir qué verificar no sirve
    // de nada delante del equipo: es la mitad del control.
    for (const r of rutasPor('documentada')) {
      expect(r.confirmarEnSitio, `${r.proposito}: no dice qué comprobar`).toBeTruthy();
    }
  });

  it('la única VERIFICADA hoy es la de la barrera, y cita su captura', () => {
    const verificadas = rutasPor('verificada');
    expect(verificadas).toHaveLength(1);
    expect(verificadas[0]?.proposito).toBe('accionar la barrera vehicular');
    expect(verificadas[0]?.fuente).toMatch(/15\/09\/2026/);
    // Y deja escrito el error que costó dos intentos, para que no se repita.
    expect(verificadas[0]?.fuente).toMatch(/notSupport/);
  });

  it('las rutas de una familia incluyen las comunes', () => {
    const deTerminal = rutasDeFamilia('terminal');
    expect(deTerminal.some((r) => r.familia === 'comun')).toBe(true);
    expect(deTerminal.some((r) => r.familia === 'videoportero')).toBe(false);
  });

  it('pedir una ruta que no existe LANZA, no devuelve nada silenciosamente', () => {
    // Un `undefined` aquí acabaría como `http://equipo/undefined`, que el
    // aparato contestaría con un 404 indistinguible de una ruta mal capturada.
    expect(() => rutaPara('teletransportar al visitante', 'terminal')).toThrow(/no catalogada/i);
  });

  it('ninguna ruta lleva una dirección de equipo dentro', () => {
    // KPI-11 lo comprueba en todo el árbol; aquí se fija en el sitio donde más
    // fácil sería colar una «para probar».
    for (const r of RUTAS) {
      expect(r.ruta).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
      expect(r.ruta.startsWith('/')).toBe(true);
    }
  });
});
