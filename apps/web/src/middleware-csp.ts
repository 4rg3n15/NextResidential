/**
 * Construcción de la Content-Security-Policy con **nonce por petición**.
 *
 * Vive aparte del middleware para poder probarla: el middleware es un punto de
 * entrada de Next y ejecutarlo en una prueba arrastra su runtime entero,
 * mientras que la política es una cadena que se puede comprobar carácter a
 * carácter. Lo que se verifica es lo que se sirve.
 *
 * **Por qué nonce y no hash ni lista blanca.** Next inyecta scripts propios en
 * cada respuesta —el arranque del cliente, el flujo de RSC— cuyo contenido
 * cambia con cada build. Un hash obligaría a regenerar la política en cada
 * despliegue; una lista blanca de orígenes no dice nada sobre lo que se inyecta
 * en la propia página. El nonce es lo único que distingue «este script lo puse
 * yo en esta respuesta» de «este script llegó por una inyección».
 */

/** 128 bits de aleatoriedad criptográfica, en base64, por respuesta. */
export const generarNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

export interface OpcionesCsp {
  readonly nonce: string;
  /**
   * En desarrollo Next evalúa código para el refresco en caliente y sin
   * `unsafe-eval` la consola no arranca. Se admite **solo ahí**, y la prueba
   * exige que en producción no aparezca: es la clase de excepción que se cuela
   * al despliegue si nadie la vigila.
   */
  readonly desarrollo: boolean;
  /** Origen de la API, si se sirve desde otro host que la consola. */
  readonly origenApi?: string | undefined;
  /** Puente de vídeo de la ETAPA 10; vacío mientras no exista. */
  readonly origenVideo?: string | undefined;
}

export const construirCsp = ({
  nonce,
  desarrollo,
  origenApi,
  origenVideo,
}: OpcionesCsp): string => {
  const conexiones = ["'self'", origenApi, origenVideo].filter(
    (o): o is string => typeof o === 'string' && o.length > 0,
  );
  const medios = ["'self'", 'blob:', origenVideo].filter(
    (o): o is string => typeof o === 'string' && o.length > 0,
  );

  const directivas: string[][] = [
    ['default-src', "'self'"],
    // `strict-dynamic` deja que los scripts que YA pasaron el nonce carguen sus
    // propios trozos —Next divide el paquete en decenas—, sin abrir la puerta a
    // ningún origen. Sin él habría que enumerar cada fragmento.
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(desarrollo ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", `'nonce-${nonce}'`],
    /**
     * **`style-src-elem` relajado SOLO en desarrollo, y solo él.**
     *
     * `next dev` inyecta el CSS con el cargador de webpack, que crea etiquetas
     * `<style>` desde el cliente y **no conoce nuestro nonce**: son las tres
     * violaciones que aparecían en `/acceso` en cada carga. Comprobado con el
     * evento `securitypolicyviolation`, que las sitúa en `webpack-internal`,
     * no en código nuestro; en la consola COMPILADA el CSS sale como fichero
     * externo y no hay ninguna.
     *
     * Lo que hace que esta excepción sea aceptable es lo que NO relaja:
     * `style-src-attr` no se declara, así que hereda de `style-src`, que sigue
     * estricto **también en desarrollo**. Es decir, los atributos `style="…"`
     * siguen bloqueados mientras se desarrolla — y ese es precisamente el
     * control que destapó que nuestros propios gráficos los emitían. Relajar
     * `style-src` entero habría apagado el control que encontró el defecto.
     *
     * En producción no aparece ninguna de las dos, y hay prueba que lo exige.
     */
    ...(desarrollo ? [['style-src-elem', "'self'", `'nonce-${nonce}'`, "'unsafe-inline'"]] : []),
    // La evidencia llega por URL firmada de vida corta desde el bucket privado,
    // que es el origen de la API. `data:` para los iconos embebidos del PWA.
    ['img-src', "'self'", 'data:', 'blob:', ...conexiones.slice(1)],
    ['font-src', "'self'"],
    ['connect-src', ...conexiones],
    ['media-src', ...medios],
    ['object-src', "'none'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['worker-src', "'self'"],
    ['manifest-src', "'self'"],
    ...(desarrollo ? [] : [['upgrade-insecure-requests']]),
  ];

  return directivas.map((d) => d.join(' ')).join('; ');
};
