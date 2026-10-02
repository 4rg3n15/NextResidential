/**
 * Los nombres de las cookies de sesión, en un módulo sin dependencias: los usan
 * `cookies.ts` (que arrastra `next/headers`) y el middleware (15-P, 0.3), y un
 * nombre escrito dos veces es un nombre que algún día difiere.
 */
export const COOKIE_ACCESO = 'ncr_acceso';
export const COOKIE_REFRESCO = 'ncr_refresco';
export const COOKIE_EXPIRA = 'ncr_expira';
