import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CodigoQr } from './codigo-qr';

describe('CodigoQr', () => {
  it('pinta un módulo por celda negra, como SVG accesible y sin HTML inyectado', () => {
    const { container } = render(
      <CodigoQr texto="https://ejemplo.invalid/consentimiento/x.y" titulo="QR" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('QR');
    const n = Number(svg?.getAttribute('data-modulos'));
    expect(n).toBeGreaterThanOrEqual(21);
    const rects = container.querySelectorAll('g rect').length;
    expect(rects).toBeGreaterThan(n); // más de una fila de módulos negros
    expect(container.innerHTML).not.toContain('<script');
  });
});
