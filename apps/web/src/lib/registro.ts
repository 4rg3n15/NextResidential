import 'server-only';

/**
 * Registro estructurado del servidor de la consola.
 *
 * Existe por un fallo concreto: la inscripción del segundo factor devolvió un
 * `503` intermitente y en los registros solo había `POST … 503 in 840ms`. Sin
 * causa no hay diagnóstico, y un `503` en el camino de acceso es lo último que
 * conviene investigar a ciegas.
 *
 * **Qué se registra y qué no.** Nivel, mensaje y un contexto de valores
 * enumerados o numéricos: estado HTTP, código de error del proveedor, ruta.
 * Nunca tokens, contraseñas, correos, secretos TOTP ni cuerpos de respuesta
 * (§2.7.8). La firma acepta `unknown` y serializa con `JSON.stringify`, así que
 * quien pase un objeto grande lo verá en su propio registro: la disciplina está
 * en quien llama, y por eso los llamantes de este módulo pasan campos sueltos.
 */
export type NivelDeRegistro = 'info' | 'aviso' | 'error';

export const registrar = (
  nivel: NivelDeRegistro,
  mensaje: string,
  contexto: Readonly<Record<string, string | number | boolean | undefined>> = {},
): void => {
  const linea = JSON.stringify({
    nivel,
    mensaje,
    momento: new Date().toISOString(),
    ...contexto,
  });
  if (nivel === 'error') console.error(linea);
  else console.warn(linea);
};
