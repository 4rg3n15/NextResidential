import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FranjaDeModoPruebas, TEXTO_MODO_PRUEBAS } from './franja-modo-pruebas';

describe('franja del modo pruebas (15-L, H5)', () => {
  it('dice el texto EXACTO del cliente, como estado que anuncia el lector de pantalla', () => {
    render(<FranjaDeModoPruebas />);
    expect(TEXTO_MODO_PRUEBAS).toBe('Modo pruebas activo: restricciones de porteros desactivadas');
    const franja = screen.getByRole('status');
    expect(franja.textContent).toBe(TEXTO_MODO_PRUEBAS);
    // Fija arriba y sin botón de cerrar: es un estado de toda la plataforma.
    expect(franja.className).toMatch(/\bsticky\b/);
    expect(franja.querySelector('button')).toBeNull();
  });
});
