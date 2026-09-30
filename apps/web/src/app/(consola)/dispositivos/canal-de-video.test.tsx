import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CampoCanalDeVideo, canalPorOmision } from './canal-de-video';

/**
 * E2/C1 (15-M) · el canal se elige entre los que el equipo declara; sin lista,
 * el campo de texto de siempre.
 */
describe('canalPorOmision', () => {
  it('el subflujo (x02) si existe; si no, el primero; sin lista, vacío', () => {
    expect(
      canalPorOmision([
        { id: '101', codec: 'H.265' },
        { id: '102', codec: 'H.264' },
      ]),
    ).toBe('102');
    expect(
      canalPorOmision([
        { id: '101', codec: null },
        { id: '201', codec: null },
      ]),
    ).toBe('101');
    expect(canalPorOmision([])).toBe('');
    expect(canalPorOmision(undefined)).toBe('');
  });
});

describe('CampoCanalDeVideo', () => {
  it('con canales, un <select> con id, flujo y códec, y avisa del guardado que el equipo no declara', () => {
    const alCambiar = vi.fn();
    render(
      <CampoCanalDeVideo
        valor="105"
        alCambiar={alCambiar}
        canales={[
          { id: '101', codec: 'H.265' },
          { id: '102', codec: 'H.264' },
          { id: '201', codec: null },
        ]}
      />,
    );
    const lista = screen.getByLabelText('Canal de video') as HTMLSelectElement;
    const opciones = Array.from(lista.options).map((o) => o.textContent);
    expect(opciones).toEqual([
      '105 — no lo declara el equipo',
      '101 (principal) — H.265',
      '102 (subflujo) — H.264',
      '201 (principal) — códec sin leer',
    ]);
    fireEvent.change(lista, { target: { value: '102' } });
    expect(alCambiar).toHaveBeenCalledWith('102');
  });

  it('sin canales (equipo sin sondear o que no los da), el campo de texto con su ayuda y su error', () => {
    render(<CampoCanalDeVideo valor="1a2" alCambiar={() => undefined} error="Escriba el canal" />);
    const campo = screen.getByLabelText(/Canal de video/) as HTMLInputElement;
    expect(campo.tagName).toBe('INPUT');
    expect(campo.value).toBe('1a2');
    expect(screen.getByText('Escriba el canal')).toBeTruthy();
    // O6 (15-N) · desde V2 un canal vacío NO es el 102 (la cámara del 29/09 no
    // lo tiene): se usa el que el equipo declare. La ayuda no puede decir otra cosa.
    expect(screen.queryByText(/Vacío = 102/)).toBeNull();
    expect(screen.getByText(/Vacío: el que el equipo declare/)).toBeTruthy();
    expect(campo.placeholder).not.toBe('102');
  });
});
