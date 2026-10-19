import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

let ruta = '/mi';
vi.mock('next/navigation', () => ({ usePathname: () => ruta }));

import { BarraInferior } from './barra-inferior';
import { navegacionDe } from '@/lib/navegacion';
import { HUECOS_DE_LA_BARRA } from '@/lib/navegacion-movil';

/** El nombre con el que lo anuncia un lector de pantalla. */
const nombreDe = (el: Element): string =>
  el.getAttribute('aria-label') ?? (el.textContent ?? '').trim();

/**
 * D-71 · LA CONSOLA EN VERTICAL SE QUEDABA SIN MENÚ
 *
 * Reportado desde el despliegue, con el residente entrando por el navegador
 * del teléfono: la barra lateral se oculta por debajo de 768 px (`hidden
 * md:flex`) y nada ocupaba su lugar, así que la navegación sólo aparecía al
 * girar el aparato. Lo que estas pruebas sostienen no es el aspecto, sino las
 * tres cosas que hacen usable un menú de iconos: que cada icono tenga nombre
 * accesible, que se llegue a TODAS las pantallas, y que el usuario nunca deje
 * de ver dónde está.
 */
describe('BarraInferior', () => {
  it('cada icono tiene nombre accesible: un icono mudo es un botón sin texto', () => {
    ruta = '/mi';
    render(<BarraInferior rol="residente" />);
    const barra = screen.getByRole('navigation', { name: 'Navegación principal' });
    const enlaces = within(barra).getAllByRole('link');
    expect(enlaces).toHaveLength(HUECOS_DE_LA_BARRA);
    for (const enlace of enlaces) expect(nombreDe(enlace)).not.toBe('');
  });

  it('marca la pantalla actual con aria-current, no sólo con color', () => {
    ruta = '/mi/vehiculos';
    render(<BarraInferior rol="residente" />);
    expect(nombreDe(screen.getByRole('link', { current: 'page' }))).toBe('Mis vehículos');
  });

  it('«/mi» no se marca cuando se está en «/mi/familia»: gana la ruta más larga', () => {
    ruta = '/mi/familia';
    render(<BarraInferior rol="residente" />);
    const actuales = screen.getAllByRole('link', { current: 'page' });
    expect(actuales).toHaveLength(1);
    expect(nombreDe(actuales[0] as Element)).toBe('Mi familia');
  });

  it('«Más» abre el resto de pantallas y las ofrece con su etiqueta', () => {
    ruta = '/mi';
    render(<BarraInferior rol="residente" />);
    const mas = screen.getByRole('button', { name: 'Más secciones' });
    expect(mas.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(mas);
    expect(mas.getAttribute('aria-expanded')).toBe('true');
    // Las ocho del residente: cinco en la barra y las demás aquí.
    expect(screen.getByRole('link', { name: 'Perfil' })).not.toBeNull();
  });

  it('todas las pantallas del rol son alcanzables, en la barra o en «Más»', () => {
    ruta = '/mi';
    render(<BarraInferior rol="residente" />);
    fireEvent.click(screen.getByRole('button', { name: 'Más secciones' }));
    for (const e of navegacionDe('residente')) {
      expect(screen.getByRole('link', { name: e.etiqueta }).getAttribute('href')).toBe(e.ruta);
    }
  });

  it('si la pantalla actual está dentro de «Más», el botón queda marcado', () => {
    // Sin esto el residente en Perfil no ve ningún elemento activo y pierde
    // la referencia de dónde está.
    ruta = '/mi/perfil';
    render(<BarraInferior rol="residente" />);
    expect(screen.queryByRole('link', { current: 'page' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Más secciones' }));
    expect(nombreDe(screen.getByRole('link', { current: 'page' }))).toBe('Perfil');
  });

  it('Escape cierra el panel', () => {
    ruta = '/mi';
    render(<BarraInferior rol="residente" />);
    const mas = screen.getByRole('button', { name: 'Más secciones' });
    fireEvent.click(mas);
    expect(mas.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mas.getAttribute('aria-expanded')).toBe('false');
  });

  it('el administrador, con más entradas, tampoco pierde ninguna', () => {
    ruta = '/tablero';
    render(<BarraInferior rol="administrador" />);
    fireEvent.click(screen.getByRole('button', { name: 'Más secciones' }));
    const disponibles = navegacionDe('administrador').filter((e) => e.pendienteDeEtapa === null);
    for (const e of disponibles) {
      expect(screen.getByRole('link', { name: e.etiqueta }).getAttribute('href')).toBe(e.ruta);
    }
  });
});
