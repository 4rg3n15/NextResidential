import { describe, expect, it } from 'vitest';
import { nit, nombreDeUsuario } from './nombre-de-usuario';
import type { NombreDeUsuario } from './nombre-de-usuario';
import { contieneCorreoSintetico, correoSintetico } from './correo-sintetico';
import { motivoDeRechazoDeContrasena } from './politica-de-contrasena';

const COP = '10000000-0000-4000-8000-000000000001';

describe('nombre de usuario (ADR-023)', () => {
  it('normaliza al construir: recorte, invisibles fuera y minúsculas', () => {
    const r = nombreDeUsuario('  Porteria.Norte​ ');
    expect(r).toEqual({ ok: true, valor: 'porteria.norte' });
  });

  it.each([
    ['ab', 'demasiado corto'],
    ['a'.repeat(33), 'demasiado largo'],
    ['.portero', 'empieza por signo'],
    ['portería', 'tilde'],
    ['por tero', 'espacio'],
    ["o'hara", 'comilla'],
    ['a@b', 'arroba'],
  ])('rechaza «%s» (%s)', (bruto) => {
    expect(nombreDeUsuario(bruto).ok).toBe(false);
  });

  it('acepta los tres signos permitidos', () => {
    expect(nombreDeUsuario('p_1.norte-2').ok).toBe(true);
  });
});

describe('NIT del identificador de acceso (C-34)', () => {
  it('normaliza como la base: sin puntos, comas ni espacios, con dígito de verificación', () => {
    expect(nit('900.123.456-7')).toEqual({ ok: true, valor: '900123456-7' });
    expect(nit('900 123 456')).toEqual({ ok: true, valor: '900123456' });
  });
  it('rechaza lo que no es un NIT', () => {
    expect(nit('abc').ok).toBe(false);
    expect(nit('1234').ok).toBe(false);
  });
});

describe('correo sintético', () => {
  it('queda bajo .invalid y lleva la copropiedad dentro', () => {
    const correo = correoSintetico('porteria1' as NombreDeUsuario, COP);
    expect(correo).toBe(`porteria1@${COP}.usuarios.ncr.invalid`);
    expect(correo.endsWith('.invalid')).toBe(true);
    expect(contieneCorreoSintetico(correo.toUpperCase())).toBe(true);
    expect(contieneCorreoSintetico('alguien@ejemplo.co')).toBe(false);
  });
});

describe('política de contraseña del servidor', () => {
  it('acepta una que cumple las cinco reglas', () => {
    expect(motivoDeRechazoDeContrasena('Garita#2026')).toBeNull();
  });
  it('enumera TODO lo que falta, no sólo lo primero', () => {
    expect(motivoDeRechazoDeContrasena('abc')).toBe(
      'A la contraseña le falta: al menos 8 caracteres, una letra mayúscula, un número, un carácter especial',
    );
  });
  it('acepta símbolos del teclado en español como especiales', () => {
    expect(motivoDeRechazoDeContrasena('Porteria¿2026')).toBeNull();
  });
  it('rechaza por encima del máximo', () => {
    expect(motivoDeRechazoDeContrasena(`Aa1!${'x'.repeat(260)}`)).toMatch(/no puede superar/);
  });
});
