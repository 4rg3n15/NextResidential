/**
 * La clave de idempotencia de un formulario (RN-17): la misma para cada
 * reintento del MISMO envío, una nueva por envío.
 *
 * POR QUÉ NO `crypto.randomUUID()` A SECAS. Sólo existe en un contexto seguro
 * (HTTPS o `localhost`). En el entorno de pruebas del conjunto la consola se
 * abre desde el teléfono por la IP de la LAN y en HTTP
 * (`http://<IP>:3100/mi/visitas`): ahí es `undefined` y la pantalla reventaba
 * al pintarse con «randomUUID is not a function». `getRandomValues`, en
 * cambio, existe también en un contexto inseguro, así que de él sale un UUID
 * v4 con los mismos bits de versión y variante que daría `randomUUID`.
 *
 * Es el ÚNICO sitio de la consola que puede llamar a `randomUUID` (lo
 * comprueba `clave-de-idempotencia.test.ts`).
 */
const hex = (b: number): string => b.toString(16).padStart(2, '0');

export const nuevaClaveDeIdempotencia = (): string => {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  // RFC 4122 §4.4: versión 4 en el nibble alto del byte 6, variante 10xx en el byte 8.
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, hex).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
