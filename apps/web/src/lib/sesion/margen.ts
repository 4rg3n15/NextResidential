/**
 * Segundos antes de la expiración en que el token se renueva. 60 y no 10: el
 * reloj del servidor y el de Supabase pueden ir desalineados, y una petición
 * puede tardar. Renovar de más cuesta una llamada; renovar de menos, una sesión
 * caída. Vive aparte para que el middleware lo use sin arrastrar `next/headers`.
 */
export const MARGEN_SEGUNDOS = 60;
