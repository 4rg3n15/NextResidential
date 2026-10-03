import { createHash } from 'node:crypto';

/**
 * E7 (15-R) · la referencia de la constancia: la del acceso más el sufijo, como
 * siempre; si así no cabe en un componente de clave (128), un resumen SHA-256
 * determinista de la referencia —reenviar el lote no la duplica—. La clave del
 * ACCESO no cambia, y las referencias que ya cabían conservan la suya.
 */
export const referenciaDeLaConstancia = (referencia: string, tipo: string): string => {
  const sufijo = `.edge-${tipo}`;
  if (referencia.length + sufijo.length <= 128) return `${referencia}${sufijo}`;
  return `h-${createHash('sha256').update(referencia).digest('hex')}${sufijo}`;
};
