import { describe, expect, it } from 'vitest';
import {
  MARCADOR_DEL_VISITANTE,
  PLANTILLA_DE_LA_CASILLA,
  VERSION_DE_LA_CASILLA,
  textoDeLaCasilla,
} from './rostro-de-visita';

/**
 * Decisión final del cliente (corrección de la 15-L, ADR-032): la casilla es
 * la única constancia y nombra al visitante con el nombre del formulario.
 */
describe('la casilla · el texto que se declara', () => {
  it('nombra al visitante con el nombre escrito, recortado', () => {
    expect(textoDeLaCasilla('  Ana María Rojas ')).toBe(
      'Declaro que Ana María Rojas me autorizó a usar su foto para su ingreso al conjunto',
    );
  });

  it('sin nombre todavía dice «el visitante», nunca el marcador', () => {
    expect(textoDeLaCasilla('   ')).toBe(
      'Declaro que el visitante me autorizó a usar su foto para su ingreso al conjunto',
    );
    expect(textoDeLaCasilla('')).not.toContain(MARCADOR_DEL_VISITANTE);
  });

  it('la plantilla lleva el marcador una vez, y la versión es la nueva', () => {
    expect(PLANTILLA_DE_LA_CASILLA.split(MARCADOR_DEL_VISITANTE)).toHaveLength(2);
    // La versión anterior —sin nombre— queda en las autorizaciones que la usaron.
    expect(VERSION_DE_LA_CASILLA).not.toBe('casilla-2026-09-27');
    expect(VERSION_DE_LA_CASILLA.length).toBeLessThanOrEqual(50);
  });
});
