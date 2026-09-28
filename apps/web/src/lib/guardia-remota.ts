/**
 * H4 (15-L) · el texto EXACTO que responde la API a un portero fuera de las IP
 * permitidas para la guardia remota, y lo que la consola añade para que sepa
 * qué hacer. La consola lo reconoce por el texto: el estado 403 solo no dice
 * si es el rol o la IP.
 */
export const MENSAJE_GUARDIA_REMOTA = 'No autorizado para guardia remota';
export const AYUDA_GUARDIA_REMOTA =
  'Esta conexión no está entre las IP permitidas para la guardia remota de la copropiedad. Pídele al superadministrador que la añada en Configuración.';
