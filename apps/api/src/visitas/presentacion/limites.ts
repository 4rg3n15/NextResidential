/**
 * F (15-L) · las rutas que llevan la foto del visitante en el cuerpo (base64)
 * y no caben en el tope general de `LIMITE_PAYLOAD`. `main.ts` les monta el
 * mismo `express.json` acotado que a la fotografía de la 15-D; el tope de
 * bytes reales lo pone el caso de uso.
 */
export const RUTAS_CON_FOTO_DE_VISITA = [
  '/copropiedades/:id/visitas',
  '/copropiedades/:id/mi/visitas',
] as const;
