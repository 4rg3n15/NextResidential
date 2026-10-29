import { describe, expect, it } from 'vitest';
import { leerCuerpoAcotado, MAXIMO_CUERPO_DEL_PROXY } from './cuerpo-acotado';

/** Un flujo que entrega `trozos` uno a uno, y anota si se canceló. */
const flujo = (trozos: readonly Uint8Array[]) => {
  const estado = { cancelado: false };
  let i = 0;
  const cuerpo = new ReadableStream<Uint8Array>({
    pull(ctl) {
      const t = trozos[i++];
      if (t === undefined) ctl.close();
      else ctl.enqueue(t);
    },
    cancel() {
      estado.cancelado = true;
    },
  });
  return { cuerpo, estado };
};

const texto = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('leerCuerpoAcotado (D-149)', () => {
  it('devuelve el cuerpo entero, con su primer trozo, en orden', async () => {
    const { cuerpo } = flujo([
      new TextEncoder().encode('{"contenidoBase64":"/9j/'),
      new TextEncoder().encode('t6mTjFAusl'),
      new TextEncoder().encode('"}'),
    ]);
    const r = await leerCuerpoAcotado(cuerpo, null);
    expect(r.tipo).toBe('cuerpo');
    if (r.tipo === 'cuerpo') expect(texto(r.bytes)).toBe('{"contenidoBase64":"/9j/t6mTjFAusl"}');
  });

  it('sin cuerpo, cero bytes', async () => {
    expect(await leerCuerpoAcotado(null, null)).toEqual({
      tipo: 'cuerpo',
      bytes: new Uint8Array(0),
    });
  });

  it('un content-length por encima del tope se rechaza SIN leer nada', async () => {
    const { cuerpo, estado } = flujo([new Uint8Array(10)]);
    expect(await leerCuerpoAcotado(cuerpo, String(MAXIMO_CUERPO_DEL_PROXY + 1))).toEqual({
      tipo: 'excede',
    });
    expect(estado.cancelado).toBe(true);
  });

  it('sin content-length (chunked), se corta en cuanto pasa del tope y cancela el flujo', async () => {
    const { cuerpo, estado } = flujo([new Uint8Array(6), new Uint8Array(6), new Uint8Array(6)]);
    expect(await leerCuerpoAcotado(cuerpo, null, 10)).toEqual({ tipo: 'excede' });
    expect(estado.cancelado).toBe(true);
  });

  it('exactamente el tope cabe', async () => {
    const { cuerpo } = flujo([new Uint8Array(5), new Uint8Array(5)]);
    const r = await leerCuerpoAcotado(cuerpo, '10', 10);
    expect(r.tipo).toBe('cuerpo');
    if (r.tipo === 'cuerpo') expect(r.bytes.byteLength).toBe(10);
  });

  it('el tope cubre la foto, que es el mayor cuerpo que admite la API (2200 kB)', () => {
    expect(MAXIMO_CUERPO_DEL_PROXY).toBeGreaterThan(2200 * 1024);
  });
});
