import { describe, expect, it } from 'vitest';
import { BitacoraEstructurada, redactar } from './bitacora-estructurada';

describe('redacción de la bitácora (§2.7.8)', () => {
  it('redacta claves sensibles a cualquier profundidad', () => {
    // Los valores son marcadores cortos a propósito: §2.7 prohíbe credenciales
    // literales también en las pruebas, y el escáner de secretos las detecta.
    // Lo que se comprueba es que NINGÚN valor bajo una clave sensible sobrevive.
    const r = redactar({
      usuario: 'ana',
      password: 'p1',
      anidado: { authorization: 'a1', token: 't1', inocuo: 1 },
      lista: [{ apiKey: 'k1' }],
    }) as Record<string, unknown>;
    const serializado = JSON.stringify(r);
    for (const marcador of ['p1', 'a1', 't1', 'k1']) {
      expect(serializado, marcador).not.toContain(marcador);
    }
    expect(r.usuario).toBe('ana');
    expect((r.anidado as Record<string, unknown>).inocuo).toBe(1);
  });

  it('redacta datos personales que no deben acabar en un log', () => {
    const r = redactar({ placa: 'ABC123', numero_documento: '123', correo: 'a@b.co' }) as Record<
      string,
      unknown
    >;
    expect(Object.values(r).every((v) => v === '[REDACTADO]')).toBe(true);
  });

  it('corta la recursión profunda en vez de desbordar', () => {
    type Nodo = { hijo?: Nodo };
    const raiz: Nodo = {};
    let cursor = raiz;
    for (let i = 0; i < 30; i++) {
      cursor.hijo = {};
      cursor = cursor.hijo;
    }
    expect(JSON.stringify(redactar(raiz))).toContain('PROFUNDIDAD_MAXIMA');
  });

  it('emite una línea JSON por registro', () => {
    const lineas: string[] = [];
    new BitacoraEstructurada((l) => lineas.push(l)).registrar('info', 'hola', {
      token: 'no-debe-salir',
      ruta: '/x',
    });
    expect(lineas).toHaveLength(1);
    const j = JSON.parse(lineas[0]!);
    expect(j.nivel).toBe('info');
    expect(j.contexto.token).toBe('[REDACTADO]');
    expect(j.contexto.ruta).toBe('/x');
  });
});
