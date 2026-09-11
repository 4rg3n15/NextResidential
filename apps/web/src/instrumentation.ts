/**
 * Validación de la configuración **al arrancar el proceso** (§2.7.1).
 *
 * El contrato es explícito: si falta una variable, la aplicación no arranca. La
 * API lo cumplía desde la ETAPA 02; la consola no, y el precio se pagó en el
 * camino de acceso — con el entorno incompleto, el primer síntoma era un `503`
 * en mitad del inicio de sesión, que parece un fallo del proveedor de identidad
 * y manda a investigar la red. Un entorno incompleto tiene que verse al
 * levantar el proceso.
 *
 * `register()` lo llama Next una sola vez cuando el servidor arranca, antes de
 * atender la primera petición. Es el único punto de la consola equivalente al
 * `main.ts` de la API.
 *
 * **Código 78 (`EX_CONFIG`)**, el mismo que la API: distingue «está mal
 * configurado» de «se ha caído», y un supervisor puede dejar de reintentar en
 * vez de girar en un bucle que no va a mejorar.
 *
 * No corre durante `next build`: el build importa los módulos sin `.env.local`
 * y hacerlo fallar ahí impediría compilar en CI, donde no hay —ni debe haber—
 * un entorno de producción.
 */
/**
 * Es `async` y Next la espera: así la validación termina **antes** de que se
 * atienda la primera petición. Con una versión que no devolviera la promesa, el
 * proceso podría servir peticiones mientras todavía se está validando, que es
 * justo el hueco que este fichero existe para cerrar.
 */
export const register = async (): Promise<void> => {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // La importación es perezosa a propósito: `configuracion.ts` lleva
  // `server-only`, y este fichero también se carga en el runtime `edge`, donde
  // solo hay que no hacer nada.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { configuracion, ConfiguracionIncompleta } = await import('./lib/configuracion');
  const { registrar } = await import('./lib/registro');
  try {
    const config = configuracion();
    // Se registra QUÉ se resolvió, nunca los valores: la llave publicable no es
    // un secreto, pero un registro que imprime llaves acaba imprimiendo la que
    // sí lo es (§2.7.8).
    registrar('info', 'consola: configuracion validada', {
      cookieSegura: config.cookieSegura,
      puenteDeVideo: config.puenteVideoUrl !== undefined,
    });
  } catch (e) {
    if (e instanceof ConfiguracionIncompleta) {
      // El mensaje va entero y sin envolver en JSON: lo lee una persona que
      // acaba de ver el proceso caerse, y una línea de JSON con saltos
      // escapados es peor de leer justo en ese momento.
      registrar('error', 'consola: configuracion invalida, el proceso no arranca');
      process.stderr.write(`${e.message}\n`);
      process.exit(78); // EX_CONFIG
      // `exit` no vuelve, pero el `return` está escrito: sin él, el flujo
      // depende de una promesa sobre el runtime, y esa dependencia se ve solo
      // cuando alguien intercepta `exit` —una prueba— y el proceso sigue.
      return;
    }
    throw e;
  }
};
