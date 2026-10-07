import { ESQUEMA_DE_AVISOS, problemaDeAvisos } from './esquema-de-avisos';
import { ESQUEMA_DE_DESPLIEGUE } from './esquema-de-despliegue';
import { ESQUEMA_DE_ICE, problemaDeIce } from './esquema-de-ice';
import { ESQUEMA_DE_ROSTRO } from './esquema-de-rostro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS VARIABLES QUE `esquema.ts` YA NO ABSORBE · 15-Q2 en adelante
 *
 * `esquema.ts` pasa de 700 líneas y la regla de la 15-U/15-R es que ningún
 * fichero existente crece. Cada grupo nuevo vive en su `esquema-de-*.ts`, con
 * su comprobación cruzada, y se reúne aquí: el esquema principal sólo esparce
 * `ESQUEMAS_ADICIONALES` y llama a `problemaAdicional`.
 *
 *  · ICE (15-Q2): STUN/TURN para el video; un TURN no va sin su secreto.
 *  · Avisos (15-R, B2): Web Push con VAPID; las tres llaves o ninguna.
 *  · Despliegue (15-R, D4): el secreto con que la consola firma la IP.
 *  · Rostro (15-X, D2): la retención del rostro del residente.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ESQUEMAS_ADICIONALES = {
  ...ESQUEMA_DE_ICE,
  ...ESQUEMA_DE_AVISOS,
  ...ESQUEMA_DE_DESPLIEGUE,
  ...ESQUEMA_DE_ROSTRO,
};

type Cruda = Parameters<typeof problemaDeIce>[0] & Parameters<typeof problemaDeAvisos>[0];

/** El primer problema de combinación entre variables, o `null`. */
export const problemaAdicional = (c: Cruda): string | null =>
  problemaDeIce(c) ?? problemaDeAvisos(c);
