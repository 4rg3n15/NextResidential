/**
 * 15-X · las rutas del rostro del residente llevan la foto en el cuerpo
 * (base64) y no caben en el tope general de `LIMITE_PAYLOAD`. `main.ts` les
 * monta el mismo `express.json` acotado que a la foto de la visita; el tope de
 * bytes reales lo pone `revisarFoto`, antes de decodificar.
 */
export const RUTAS_CON_FOTO_DE_ROSTRO = [
  '/copropiedades/:id/mi/rostro',
  '/copropiedades/:id/mi/menores/:residenteId/rostro',
] as const;
