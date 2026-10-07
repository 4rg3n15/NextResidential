import { z } from 'zod';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · EL ROSTRO DEL RESIDENTE (ADR-039, D-W3)
 *
 *  · `ROSTRO_RESIDENTE_RETENCION_DIAS` — cuántos días vive el rostro de un
 *    residente antes de suprimirse si no lo renueva: 365 por omisión (D-W3,
 *    renovación anual). Acotado entre 30 y 1825: por debajo de un mes la
 *    renovación sería una molestia diaria, y por encima de cinco años choca
 *    con la cota de la base (`plantillas_supresion_acotada`, 0022). Para el
 *    menor la retención es la menor de ésta y el día en que cumple 18 (D3).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ESQUEMA_DE_ROSTRO = {
  ROSTRO_RESIDENTE_RETENCION_DIAS: z.coerce.number().int().min(30).max(1825).default(365),
};
