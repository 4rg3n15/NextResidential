/**
 * A5 (15-E) · La oferta SDP del navegador llega como `application/sdp`, que
 * `express.json` no parsea. `main.ts` y el banco de pruebas montan
 * `express.text` SÓLO bajo esta ruta, antes de los demás parsers, igual que
 * el trozo de audio (`ruta-de-audio.ts`). Vive en `comun` por la misma razón
 * que aquél: una arista desde `main.ts` hacia el barril de guardia entra al
 * ciclo de carga por el lado equivocado (D-66).
 */
export const RUTA_DE_WHEP_DE_VIDEO = '/copropiedades/:id/guardia/video/:dispositivoId/whep';

/** El tipo de medio de una oferta y una respuesta WHEP (RFC 9725). */
export const TIPO_SDP = 'application/sdp';

/** Una oferta SDP con varios candidatos ICE ronda los 2-6 KiB: 64 KiB sobra. */
export const LIMITE_DE_OFERTA_SDP = '64kb';
