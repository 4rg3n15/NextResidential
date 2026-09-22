/**
 * Versión que la API declara al agregador de errores (`release` de Sentry) y
 * al informe de salud.
 *
 * Vive en un fichero y no se lee de `package.json` en tiempo de ejecución por
 * una razón concreta: `dist/main.js` no tiene el `package.json` al lado —el
 * empaquetado lo deja donde le conviene— y una lectura que falla en producción
 * y funciona en desarrollo es el peor modo de fallo posible para algo cuya
 * única misión es decir qué versión se está ejecutando.
 */
export const VERSION_API = '0.1.0';
