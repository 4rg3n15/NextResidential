/**
 * ═════════════════════════════════════════════════════════════════════════════
 * R2 (ETAPA 15-L) · CON QUÉ IDENTIFICA EL EQUIPO SU PROPIO EVENTO
 *
 * Hasta la 15-L la referencia de un evento del flujo era `dispositivo:canal`.
 * Es CONSTANTE: todos los rostros de una terminal por el mismo canal daban la
 * misma referencia, la clave de idempotencia (RN-17) salía igual, y del
 * segundo rostro en adelante el ingestor lo tomaba por «DUPLICADO» y la
 * terminal recibía `failed`. En sitio, la primera persona entraba y la segunda
 * no.
 *
 * La guía de verificación remota dice qué identifica a un evento: su
 * `serialNo` —el mismo que la plataforma tiene que devolver con el
 * veredicto—. La referencia lleva ahora el número de serie y, si el equipo
 * los emite, la HORA DEL EQUIPO tal cual la escribió y su `uid`. La hora
 * cubre el caso en que el equipo reinicia y vuelve a contar desde cero.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA HORA DEL EQUIPO, NO `ocurridoEn`
 *
 * La política de idempotencia del dominio prohíbe meter la marca de tiempo en
 * la clave: el Edge puede recalcular `ocurridoEn` al reconciliar y el mismo
 * hecho daría dos claves. Eso no cambia. Lo que entra aquí es el TEXTO que el
 * equipo escribió en su evento: si el equipo reenvía el mismo evento, el texto
 * es el mismo, y la clave también. Nunca se usa la hora de recepción.
 *
 * El resultado sólo lleva letras, dígitos y puntos, dentro de los 128
 * caracteres que admite la clave: una referencia inadmisible haría fallar el
 * registro del evento, que es peor que no tener referencia.
 */

/** Letras y dígitos, acotado: lo único que la clave de idempotencia admite sin riesgo. */
const compacto = (texto: string, maximo: number): string =>
  texto.replace(/[^A-Za-z0-9]/g, '').slice(0, maximo);

export interface PiezasDeReferencia {
  readonly canal?: number | string | undefined;
  /** `serialNo` del evento: lo que identifica la petición de verificación. */
  readonly serie?: number | string | null | undefined;
  /** La hora TAL COMO LA ESCRIBIÓ el equipo (`dateTime` o `time`). */
  readonly fecha?: string | null | undefined;
  /** `uid` del evento, si el firmware lo emite. `[SUPUESTO]` S-66. */
  readonly uid?: string | null | undefined;
  /** `cmdType` de la llamada: una llamada y su cancelación comparten serie. */
  readonly orden?: string | null | undefined;
}

const pieza = (valor: number | string | null | undefined, maximo: number): string =>
  valor === undefined || valor === null ? '' : compacto(String(valor), maximo);

/**
 * `null` cuando el equipo no emitió NADA que identifique el evento: ni serie,
 * ni uid, ni hora. Sólo el canal no basta, y ese era el defecto.
 */
export const referenciaDelEvento = (p: PiezasDeReferencia): string | null => {
  const serie = pieza(p.serie, 20);
  const uid = pieza(p.uid, 40);
  const fecha = pieza(p.fecha, 24);
  if (serie === '' && uid === '' && fecha === '') return null;
  const orden = pieza(p.orden, 16);
  return [
    `c${pieza(p.canal, 8) || '0'}`,
    ...(serie === '' ? [] : [`s${serie}`]),
    ...(orden === '' ? [] : [`o${orden}`]),
    ...(fecha === '' ? [] : [`t${fecha}`]),
    ...(uid === '' ? [] : [`u${uid}`]),
  ].join('.');
};
