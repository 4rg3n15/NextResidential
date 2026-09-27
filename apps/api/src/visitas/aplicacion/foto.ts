/**
 * Las mismas defensas de la foto que la evidencia del visitante (ADR-021): el
 * tope y el tipo real vienen de un solo sitio, para que la comprobación previa
 * de este módulo y la del caso de uso de autorizaciones no puedan divergir.
 */
export { TIPOS_DE_IMAGEN_ADMITIDOS, tipoRealDe } from '../../comun/archivos/tipo-real';
export { MAX_BASE64_FOTOGRAFIA } from '../../autorizaciones';
