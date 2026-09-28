import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Ayuda } from './ayuda';

describe('el «!» de ayuda (Bloque I)', () => {
  it('es un botón con nombre, y su frase describe al botón aunque esté cerrada', () => {
    render(<Ayuda texto="El veto manda sobre cualquier permiso." />);
    const boton = screen.getByRole('button', { name: 'Más información' });
    expect(boton.textContent).toBe('!');
    const ayuda = screen.getByRole('tooltip', { hidden: true });
    expect(boton.getAttribute('aria-describedby')).toBe(ayuda.id);
    expect(ayuda.textContent).toBe('El veto manda sobre cualquier permiso.');
    expect(ayuda.className).toMatch(/\bsr-only\b/);
  });

  it('se abre con el teclado (foco) y con un toque, y Escape la cierra', () => {
    render(<Ayuda texto="Frase." />);
    const boton = screen.getByRole('button', { name: 'Más información' });
    const ayuda = screen.getByRole('tooltip', { hidden: true });
    fireEvent.focus(boton);
    expect(ayuda.className).not.toMatch(/\bsr-only\b/);
    fireEvent.keyDown(boton, { key: 'Escape' });
    expect(ayuda.className).toMatch(/\bsr-only\b/);
    fireEvent.blur(boton);
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(ayuda.className).not.toMatch(/\bsr-only\b/);
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('false');
  });
});
