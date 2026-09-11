import { describe, expect, it } from 'vitest';
import {
  LONGITUD_MAXIMA,
  LONGITUD_MINIMA,
  REQUISITOS,
  contrasenaValida,
  motivoDeRechazo,
  requisitosCumplidos,
} from './politica-contrasena';

describe('política de contraseña · los cinco requisitos', () => {
  it('acepta una que los cumple todos', () => {
    expect(contrasenaValida('Portero1!')).toBe(true);
  });

  it('rechaza por cada requisito que falte, uno a uno', () => {
    expect(contrasenaValida('Corta1!')).toBe(false); // 7 caracteres
    expect(contrasenaValida('portero1!')).toBe(false); // sin mayúscula
    expect(contrasenaValida('PORTERO1!')).toBe(false); // sin minúscula
    expect(contrasenaValida('PorteroA!')).toBe(false); // sin número
    expect(contrasenaValida('Portero12')).toBe(false); // sin especial
  });

  it('en el límite exacto de longitud, acepta', () => {
    const justa = 'Abcd12!x';
    expect(justa).toHaveLength(LONGITUD_MINIMA);
    expect(contrasenaValida(justa)).toBe(true);
  });

  it('devuelve TODOS los requisitos, no el primero que falla', () => {
    // Marcarlos de uno en uno obliga a adivinar la regla a base de intentos.
    const cumplidos = requisitosCumplidos('abc');
    expect(cumplidos).toEqual({
      longitud: false,
      mayuscula: false,
      minuscula: true,
      numero: false,
      especial: false,
    });
  });

  it('«especial» admite los símbolos que un hispanohablante teclea', () => {
    // Una lista literal `!@#$%` diría que `¿` no es un símbolo. Lo es.
    for (const contrasena of ['Portero1¿', 'Portero1—', 'Portero1·', 'Portero1€']) {
      expect(contrasenaValida(contrasena), contrasena).toBe(true);
    }
  });

  it('una letra acentuada NO cuenta como especial: sigue siendo letra', () => {
    expect(contrasenaValida('Porterón1')).toBe(false);
  });

  it('el espacio no cuenta como carácter especial', () => {
    expect(contrasenaValida('Portero 1')).toBe(false);
  });

  it('rechaza por encima del máximo', () => {
    const enorme = `A1!${'a'.repeat(LONGITUD_MAXIMA)}`;
    expect(contrasenaValida(enorme)).toBe(false);
    expect(motivoDeRechazo(enorme)).toContain(String(LONGITUD_MAXIMA));
  });
});

describe('motivoDeRechazo · dice lo que falta, no la política entera', () => {
  it('nombra solo el requisito incumplido', () => {
    const motivo = motivoDeRechazo('portero1!');
    expect(motivo).toContain('mayúscula');
    expect(motivo).not.toContain('número');
    expect(motivo).not.toContain('minúscula');
  });

  it('con una válida no hay motivo', () => {
    expect(motivoDeRechazo('Portero1!')).toBeNull();
  });

  it('los cinco requisitos tienen texto en español', () => {
    expect(REQUISITOS).toHaveLength(5);
    for (const r of REQUISITOS) expect(r.texto.length).toBeGreaterThan(3);
  });
});
