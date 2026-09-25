/**
 * La fotografía del visitante viaja en JSON (base64) y no cabe en el tope
 * general de `LIMITE_PAYLOAD` (256 kB). Se admite más SÓLO bajo su ruta, y
 * sigue acotada: `main.ts` monta un `express.json` propio para este camino
 * antes del general, igual que hace con el sobre del Alarm Server. El tope de
 * bytes reales lo pone el caso de uso (`MAX_BYTES_FOTOGRAFIA`).
 */
export const RUTA_DE_FOTOGRAFIA_DE_VISITANTE =
  '/copropiedades/:id/autorizaciones/:autorizacionId/fotografia';
/** 1,5 MiB decodificados caben en ~2 MiB de JSON con base64 y sobre. */
export const LIMITE_DE_FOTOGRAFIA = '2200kb';
