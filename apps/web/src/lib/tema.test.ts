import { describe, expect, it } from 'vitest';
import {
  CLAVE_ALMACENAMIENTO,
  GUION_DE_TEMA,
  PREFERENCIAS,
  atributoDeTema,
  preferenciaValida,
  temaEfectivo,
} from './tema';

describe('preferencia de tema', () => {
  it('lo que no es una de las tres preferencias es «sistema»', () => {
    expect(preferenciaValida(null)).toBe('sistema');
    expect(preferenciaValida(undefined)).toBe('sistema');
    expect(preferenciaValida('')).toBe('sistema');
    expect(preferenciaValida('dark')).toBe('sistema');
    expect(preferenciaValida('<script>')).toBe('sistema');
  });

  it('acepta las tres', () => {
    for (const p of PREFERENCIAS) expect(preferenciaValida(p)).toBe(p);
  });
});

describe('resolución del tema efectivo', () => {
  it('una elección explícita ignora al sistema', () => {
    expect(temaEfectivo('claro', true)).toBe('claro');
    expect(temaEfectivo('oscuro', false)).toBe('oscuro');
  });

  it('«sistema» sigue a la preferencia del sistema operativo', () => {
    expect(temaEfectivo('sistema', true)).toBe('oscuro');
    expect(temaEfectivo('sistema', false)).toBe('claro');
  });
});

describe('atributo data-tema', () => {
  it('con «sistema» NO se escribe atributo: manda la consulta @media', () => {
    // Es lo que hace que el tema salga correcto sin JavaScript y que la consola
    // siga al sistema si este cambia con la pestaña abierta.
    expect(atributoDeTema('sistema')).toBeUndefined();
  });

  it('con una elección explícita, el atributo la lleva', () => {
    expect(atributoDeTema('claro')).toBe('claro');
    expect(atributoDeTema('oscuro')).toBe('oscuro');
  });
});

describe('guion en línea contra el destello', () => {
  it('lee la misma clave que escribe el conmutador', () => {
    expect(GUION_DE_TEMA).toContain(CLAVE_ALMACENAMIENTO);
  });

  it('está envuelto en try: en modo privado localStorage lanza', () => {
    expect(GUION_DE_TEMA).toContain('try{');
  });

  it('no contiene saltos de línea ni comillas dobles que rompan el HTML', () => {
    expect(GUION_DE_TEMA).not.toContain('\n');
    expect(GUION_DE_TEMA).not.toContain('"');
    expect(GUION_DE_TEMA).not.toContain('</');
  });

  it('es evaluable y aplica la preferencia guardada sobre el documento', () => {
    localStorage.setItem(CLAVE_ALMACENAMIENTO, 'oscuro');
    eval(GUION_DE_TEMA);
    expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro');

    localStorage.setItem(CLAVE_ALMACENAMIENTO, 'sistema');
    eval(GUION_DE_TEMA);
    expect(document.documentElement.getAttribute('data-tema')).toBeNull();

    localStorage.removeItem(CLAVE_ALMACENAMIENTO);
  });
});
