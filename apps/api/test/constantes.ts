/**
 * Identificadores compartidos por el banco de pruebas.
 *
 * Viven aquí y no en `utilidades.ts` por un ciclo de importación real: el doble
 * del directorio del residente los necesita, `utilidades.ts` construye la app
 * con ese doble, y el doble volvía a `utilidades.ts` a buscarlos. El ciclo no
 * daba error de compilación: dejaba las constantes en `undefined` en el momento
 * de construir los datos del doble, así que la copropiedad del vínculo era
 * `undefined` y todas las peticiones del residente respondían 403 «el vínculo
 * pertenece a otra copropiedad». Un módulo de constantes sin dependencias no
 * puede participar en un ciclo.
 */
export const COP_A = '10000000-0000-4000-8000-000000000001';
export const COP_B = '10000000-0000-4000-8000-000000000002';
