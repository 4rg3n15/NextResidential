/**
 * La REFERENCIA de la credencial de un Edge (`edge_gateways.credencial_ref`,
 * migración 0009: `^(env|vault):…$`). No es el secreto: dice de qué maestra se
 * deriva (`INGESTA_FIRMA_SECRETO`) y qué generación vale. Rotar es pasar a la
 * siguiente: la anterior deja de producir firmas válidas en ese instante.
 */
const PREFIJO = 'env:INGESTA_FIRMA_SECRETO/g';
const FORMA = /^env:INGESTA_FIRMA_SECRETO\/g([1-9][0-9]{0,5})$/;

export const referenciaDeGeneracion = (generacion: number): string =>
  `${PREFIJO}${String(generacion)}`;

/**
 * La siguiente generación. Una referencia con otra forma —escrita a mano, de
 * otro esquema— empieza en la 1 en vez de fallar: lo que importa es que la
 * nueva sea DISTINTA de la que había, y lo es.
 */
export const siguienteReferencia = (actual: string): string => {
  const coincidencia = FORMA.exec(actual);
  return referenciaDeGeneracion(coincidencia === null ? 1 : Number(coincidencia[1]) + 1);
};
