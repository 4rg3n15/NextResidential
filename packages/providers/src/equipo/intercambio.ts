/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-13 · LA PETICIÓN Y LA RESPUESTA ISAPI, COMPLETAS Y SIN SECRETOS
 *
 * En sitio, el 26/09/2026, la terminal y el videoportero contestaron «OK» a la
 * orden de abrir y la puerta no se movió. Con sólo «aceptada» en la bitácora no
 * hay nada que comparar con la guía: hace falta el cuerpo que se envió y el que
 * volvió. Esto los deja listos para la bitácora quitando lo que no puede salir:
 * contraseñas de puerta, claves y cualquier cosa con forma de token. Las
 * cabeceras no se registran nunca —ahí viaja el Digest—.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const MAXIMO = 2048;

const SECRETOS: readonly RegExp[] = [
  // XML: <password>…</password>, <passWord>, <userPassword>, <secretKey>…
  /(<(?:\w*:)?(?:\w*pass\w*|secret\w*|\w*key)\b[^>]*>)[^<]*(<\/)/gi,
  // JSON: "password": "…", "userPassword": "…", "secretKey": "…"
  /("(?:\w*pass\w*|secret\w*|\w*key)"\s*:\s*")[^"]*(")/gi,
];

export const sinSecretos = (texto: string): string =>
  SECRETOS.reduce((t, patron) => t.replace(patron, '$1***$2'), texto)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[token]')
    .replace(/(digest|bearer|basic)\s+[^\s,]+[^\n]*/gi, '$1 [omitido]');

/** Recorta sin partir un carácter y dice cuánto quedó fuera. */
export const recortado = (texto: string, maximo = MAXIMO): string =>
  texto.length <= maximo
    ? texto
    : `${texto.slice(0, maximo)}… (${String(texto.length - maximo)} caracteres más)`;

export interface IntercambioIsapi {
  readonly metodo: string;
  readonly ruta: string;
  readonly enviado: string | null;
  readonly estado: number;
  readonly recibido: string;
  readonly latenciaMs: number;
}

/** Lo que va a la bitácora: saneado y acotado. */
export const intercambioParaBitacora = (i: IntercambioIsapi): Record<string, unknown> => ({
  metodo: i.metodo,
  ruta: sinSecretos(i.ruta.replace(/([?&](?:security|iv|password|key)=)[^&]*/gi, '$1***')),
  enviado: i.enviado === null ? null : recortado(sinSecretos(i.enviado)),
  estadoHttp: i.estado,
  recibido: recortado(sinSecretos(i.recibido)),
  latenciaMs: i.latenciaMs,
});
