import { describe, expect, it } from 'vitest';
import { conContexto } from '../contexto/contexto-de-peticion';
import { BitacoraEstructurada, SEVERIDAD, redactar } from './bitacora-estructurada';

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

  // ── ETAPA 14 · correlación y nivel ────────────────────────────────────────

  it('TODA línea escrita dentro de una petición lleva su correlación', () => {
    // Es la mitad que faltaba: el identificador existía en la cabecera desde la
    // ETAPA 02 y ninguna línea de registro lo contenía, así que un usuario que
    // reportaba su `x-request-id` no podía filtrar nada con él.
    const lineas: string[] = [];
    const bitacora = new BitacoraEstructurada((l) => lineas.push(l));
    conContexto({ correlacion: 'traza-42', metodo: 'POST', ruta: '/ingesta/eventos' }, () => {
      bitacora.registrar('info', 'desde tres capas más abajo');
    });
    const j = JSON.parse(lineas[0]!);
    expect(j.correlacion).toBe('traza-42');
    expect(j.peticion).toBe('POST /ingesta/eventos');
  });

  it('fuera de una petición NO inventa correlación', () => {
    const lineas: string[] = [];
    new BitacoraEstructurada((l) => lineas.push(l)).registrar('info', 'arranque');
    const j = JSON.parse(lineas[0]!);
    expect(j).not.toHaveProperty('correlacion');
    expect(j).not.toHaveProperty('peticion');
  });

  it('`LOG_LEVEL` silencia lo que está por debajo, y nada más', () => {
    const lineas: string[] = [];
    const bitacora = new BitacoraEstructurada((l) => lineas.push(l), 'aviso');
    bitacora.registrar('debug', 'no sale');
    bitacora.registrar('info', 'tampoco');
    bitacora.registrar('aviso', 'sí sale');
    bitacora.registrar('error', 'y este también');
    expect(lineas.map((l) => JSON.parse(l).mensaje)).toEqual(['sí sale', 'y este también']);
  });

  it('por omisión no silencia nada: un valor por omisión no puede perder logs', () => {
    const lineas: string[] = [];
    new BitacoraEstructurada((l) => lineas.push(l)).registrar('debug', 'sale');
    expect(lineas).toHaveLength(1);
  });

  it('la escala de severidad es estrictamente creciente', () => {
    expect(SEVERIDAD.debug).toBeLessThan(SEVERIDAD.info);
    expect(SEVERIDAD.info).toBeLessThan(SEVERIDAD.aviso);
    expect(SEVERIDAD.aviso).toBeLessThan(SEVERIDAD.error);
  });
});
