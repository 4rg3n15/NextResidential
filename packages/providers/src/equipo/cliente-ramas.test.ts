import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { ClienteDeEquipo, EquipoInalcanzable } from './cliente';
import { servidorDigest } from '../simulacion/servidor-digest';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-K · LAS RAMAS DEL CLIENTE QUE LA VISITA HIZO CRECER
 *
 * La bitácora de intercambios (H-SITIO-13), el flujo de eventos en bytes
 * (H-SITIO-14) y la clasificación del `401` (H-SITIO-12) añadieron caminos que
 * sólo se recorren con un equipo raro: uno que contesta `401` sin desafío, un
 * simulado sin cuerpo en flujo, un cuerpo binario en la bitácora, un equipo
 * que no contesta. Cada uno, aquí, con lo que el cliente tiene que decir.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const bitacora = (): Bitacora & {
  lineas: { nivel: string; mensaje: string; datos: unknown }[];
} => {
  const lineas: { nivel: string; mensaje: string; datos: unknown }[] = [];
  return {
    lineas,
    registrar: (nivel, mensaje, datos) => lineas.push({ nivel, mensaje, datos }),
  };
};

const respuesta = (estado: number, cuerpo: string, cabeceras: Record<string, string> = {}) =>
  ({
    status: estado,
    ok: estado >= 200 && estado < 300,
    headers: new Headers(cabeceras),
    text: async () => cuerpo,
    body: null,
  }) as unknown as Response;

const cliente = (peticion: typeof fetch, traza?: Bitacora, extra: object = {}) =>
  new ClienteDeEquipo({
    host: `equipo-${String(Math.random()).slice(2)}.invalid`,
    usuario: 'servicio',
    clave: 'k',
    peticion,
    ...(traza === undefined ? {} : { traza }),
    ...extra,
  });

describe('15-K · la bitácora de intercambios (H-SITIO-13)', () => {
  it('sin cuerpo registra «enviado» nulo; con cuerpo binario, su tamaño y no sus bytes', async () => {
    const traza = bitacora();
    const c = cliente(async () => respuesta(200, '<ok/>'), traza);
    await c.pedir('GET', '/estado', undefined, { registrarIntercambio: 'estado' });
    await c.pedir(
      'PUT',
      '/imagen',
      { tipo: 'image/jpeg', contenido: new Uint8Array([1, 2, 3]) },
      { registrarIntercambio: 'imagen' },
    );
    const lineas = traza.lineas.filter((l) => l.mensaje.startsWith('intercambio con el equipo'));
    expect(lineas).toHaveLength(2);
    expect(JSON.stringify(lineas[0]?.datos)).toContain('"enviado":null');
    expect(JSON.stringify(lineas[1]?.datos)).toContain('(3 bytes image/jpeg)');
  });

  it('sin traza no registra nada y la orden sigue', async () => {
    const c = cliente(async () => respuesta(200, '<ok/>'));
    const r = await c.pedir('GET', '/estado', undefined, { registrarIntercambio: 'estado' });
    expect(r.ok).toBe(true);
  });
});

describe('15-K · el 401 que no es Digest (H-SITIO-12)', () => {
  it('un 401 SIN desafío no se reintenta y deja un aviso: no hay con qué renegociar', async () => {
    const traza = bitacora();
    let llamadas = 0;
    const c = cliente(async () => {
      llamadas += 1;
      return respuesta(401, 'no');
    }, traza);
    const r = await c.pedir('GET', '/estado');
    expect(r.estado).toBe(401);
    expect(llamadas).toBe(1);
    expect(traza.lineas.some((l) => /401 SIN desafío Digest/.test(l.mensaje))).toBe(true);
  });

  it('el equipo que cambia de nonce a mitad de sesión se anota como «nonce nuevo»', async () => {
    const traza = bitacora();
    let t = 0;
    const equipo = servidorDigest({
      usuario: 'servicio',
      clave: 'k',
      politica: { usosMaximos: 1, ahora: () => t },
      atender: async () => respuesta(200, '<ok/>'),
    });
    const c = cliente(equipo.peticion, traza, { ahora: () => t });
    await c.pedir('GET', '/a');
    t += 10;
    await c.pedir('GET', '/b');
    const motivos = traza.lineas
      .filter((l) => l.mensaje === 'Digest renegociado con el equipo')
      .map((l) => (l.datos as { motivo: string }).motivo);
    expect(motivos[0]).toBe('primer contacto');
    // E1-b (15-M) · el nonce rechazado se descarta y el nuevo llega en un
    // intercambio limpio: otro «primer contacto», anotado con su porqué.
    expect(traza.lineas.some((l) => /nonce guardado: se descarta/.test(l.mensaje))).toBe(true);
    expect(motivos).toHaveLength(2);
  });
});

describe('15-K · los flujos de un simulado sin cuerpo en flujo (H-SITIO-14)', () => {
  it('abrirFlujoDeEventos entrega el texto entero de una vez; vacío, nada', async () => {
    const lleno = cliente(async () =>
      respuesta(200, '{"a":1}', { 'content-type': 'application/json' }),
    );
    const f = await lleno.abrirFlujoDeEventos('/eventos');
    const trozos: Uint8Array[] = [];
    for await (const t of f.trozos) trozos.push(t);
    expect(f.tipo).toBe('application/json');
    expect(new TextDecoder().decode(trozos[0])).toBe('{"a":1}');

    const vacio = cliente(async () => respuesta(200, ''));
    const g = await vacio.abrirFlujoDeEventos('/eventos');
    const nada: Uint8Array[] = [];
    for await (const t of g.trozos) nada.push(t);
    expect(nada).toHaveLength(0);
  });

  it('flujo y flujoBinario sin cuerpo terminan sin entregar nada', async () => {
    const c = cliente(async () => respuesta(200, 'ignorado'));
    const textos: string[] = [];
    for await (const t of c.flujo('/eventos')) textos.push(t);
    const bytes: Uint8Array[] = [];
    for await (const b of c.flujoBinario('/audio')) bytes.push(b);
    expect(textos).toHaveLength(0);
    expect(bytes).toHaveLength(0);
  });

  it('flujoBinario entrega los bytes de un cuerpo en flujo, tal cual', async () => {
    const c = cliente(async () => new Response(new Uint8Array([0xff, 0x00, 0x7f])));
    const bytes: number[] = [];
    for await (const b of c.flujoBinario('/audio')) bytes.push(...b);
    expect(bytes).toEqual([0xff, 0x00, 0x7f]);
  });
});

describe('15-K · el equipo que no contesta', () => {
  it('subir un flujo a un equipo inalcanzable es EquipoInalcanzable, no un error suelto', async () => {
    const c = cliente(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      c.subirFlujo('/audio', () => new ReadableStream<Uint8Array>(), 'audio/basic'),
    ).rejects.toBeInstanceOf(EquipoInalcanzable);
  });

  it('un tiempo agotado se dice con el plazo, no como «no se pudo alcanzar»', async () => {
    const c = cliente(
      async () => {
        const e = new Error('agotado');
        e.name = 'TimeoutError';
        throw e;
      },
      undefined,
      { tiempoLimiteMs: 1234 },
    );
    await expect(c.pedir('GET', '/estado')).rejects.toThrow(/1234 ms/);
  });
});
