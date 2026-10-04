import { z } from 'zod';

/**
 * 15-R · D4 · la consola fuera de la red de la API (Netlify, P-20).
 *
 *  · `API_IP_FIRMA_SECRETO` — el secreto que comparte con la consola
 *    (`CONSOLA_IP_FIRMA_SECRETO`) para firmar la IP del navegador
 *    (`comun/ip-firmada.ts`). Opcional: sin él, en sitio, manda el
 *    `trust proxy` acotado de siempre (R1). Con la consola en Netlify es
 *    OBLIGATORIO en la práctica: sin él la API vería la IP de Netlify y la
 *    lista blanca de porteros negaría a todos (deniega por omisión).
 */
export const ESQUEMA_DE_DESPLIEGUE = {
  API_IP_FIRMA_SECRETO: z
    .string()
    .min(32, 'API_IP_FIRMA_SECRETO debe tener al menos 32 caracteres')
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\s\u0000-\u001f\u007f]/.test(v), {
      message: 'API_IP_FIRMA_SECRETO contiene espacios o caracteres de control',
    })
    .optional(),
};
