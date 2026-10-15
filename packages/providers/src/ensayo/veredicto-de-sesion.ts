/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DT-15S4-01 (15-S6) · LO QUE EL DIAGNÓSTICO PUEDE AFIRMAR DE UN 400, Y LO QUE NO
 *
 * El 09/10 `sitio:audio` dijo «sessionId: rechazado» en los dos equipos por un
 * 400 que siguió igual sin el `sessionId` (C-65). La regla de la sesión
 * (`rechazoPorSesion`, congelada: la usa la guardia en vivo) deja de mandar el
 * id ante el PRIMER 400; eso es prudente para hablar, pero no es una prueba.
 *
 * Aquí se lee lo que la sesión anotó, en orden, y sólo se atribuye el 400 al
 * `sessionId` cuando la MISMA petición, repetida sin él, obtuvo 2xx. En
 * cualquier otro caso el informe dice «400 de causa no determinada».
 *
 * Y lo que el diagnóstico hace con una subida rechazada: contar las
 * reaperturas y detener el tono tras un máximo, con una pausa entre ellas.
 * El adaptador (congelado) reabre en cada trama sin pausa; la pausa y el tope
 * viven en el diagnóstico, que es lo único que esta ronda puede tocar.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SIN_SESION = ': se repite sin sessionId';
const ESTADO = /^(.+?) (\d{3})$/;

export type VeredictoDeSesion =
  | 'usado'
  | 'no lo dio el equipo'
  | 'rechazado (demostrado: sin él, 2xx)'
  | '400 de causa no determinada (igual sin sessionId)'
  | '400 de causa no determinada (no se repitió sin sessionId)';

/**
 * `resumenSessionId` es lo que la sesión resume (`usado`, `rechazado`, `no lo
 * dio el equipo`); `estados`, su lista `estadosHttp` en orden.
 */
export const veredictoDeSesion = (
  resumenSessionId: unknown,
  estados: readonly string[],
): VeredictoDeSesion => {
  if (resumenSessionId !== 'rechazado') {
    return resumenSessionId === 'usado' ? 'usado' : 'no lo dio el equipo';
  }
  const corte = estados.findIndex((e) => e.endsWith(SIN_SESION));
  if (corte < 0) return '400 de causa no determinada (no se repitió sin sessionId)';
  const que = estados[corte]?.slice(0, -SIN_SESION.length) ?? '';
  const despues = estados
    .slice(corte + 1)
    .map((e) => ESTADO.exec(e))
    .filter((m): m is RegExpExecArray => m !== null && m[1] === que)
    .map((m) => Number(m[2]));
  if (despues.length === 0) return '400 de causa no determinada (no se repitió sin sessionId)';
  return despues.some((n) => n < 300)
    ? 'rechazado (demostrado: sin él, 2xx)'
    : '400 de causa no determinada (igual sin sessionId)';
};

/** Cuántos `PUT audioData` con 4xx hay anotados: cada uno es una reapertura rechazada. */
export const subidasRechazadas = (estados: readonly string[]): number =>
  estados.filter((e) => /^PUT audioData 4\d\d$/.test(e)).length;

/** Política del tono ante rechazos: pausa acotada entre reaperturas y un tope. */
export const PAUSA_TRAS_RECHAZO_MS = 250;
export const REAPERTURAS_MAXIMAS = 3;
