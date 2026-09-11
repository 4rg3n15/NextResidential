/**
 * Preset Tailwind compartido — derivado del sistema de diseño de la ETAPA 00
 * (`docs/auditoria/03-mockups.md` §5), extraído por análisis de frecuencia
 * sobre los píxeles del mockup y no a ojo.
 *
 * Vive aquí para que la consola de administración (ETAPA 09), las consolas
 * operativas (ETAPA 10) y, traducido a `ThemeData`, la app Flutter (ETAPA 11)
 * no diverjan. Se declara **sin importar `tailwindcss`**: es un objeto plano que
 * el consumidor pasa en `presets`, así que este paquete no arrastra esa
 * dependencia ni obliga a las tres superficies a compartir su versión.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DECISIÓN NO OBVIA · el rojo de marca no llega a AA y no se cambia
 *
 * `#E63946` sobre blanco da **3,9 : 1**. AA exige 4,5 : 1 para texto normal, y
 * 3 : 1 para texto grande y componentes de interfaz. Es color de marca: cambiarlo
 * sería rehacer la identidad para arreglar un problema de contraste.
 *
 * La salida es una **variante oscurecida para texto y bordes**, no un segundo
 * rojo de marca:
 *
 *   `marca.DEFAULT` #E63946 — relleno sólido de botón con texto BLANCO,
 *                             filete del elemento activo, distintivos. Cumple
 *                             3 : 1 como componente.
 *   `marca.texto`   #A23037 — 6,4 : 1 sobre blanco. TODO texto pequeño en rojo,
 *                             enlaces, bordes de campo con error, iconos que
 *                             portan significado.
 *
 * La identidad no se toca: el color dominante de la pantalla sigue siendo
 * #E63946, porque es el de los rellenos, que es donde se ve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA OTRA · el rojo es a la vez marca y peligro
 *
 * «DENEGAR» y «+ Nueva Autorización» comparten color en el mockup. No se
 * resuelve con dos rojos compitiendo, sino con **forma y fricción**: la acción
 * destructiva u operativa de riesgo va con relleno sólido y confirmación con
 * motivo obligatorio; la constructiva, con relleno sólido y sin confirmación.
 * El verde queda reservado a RESULTADO positivo —permitido, en línea,
 * aprobar—, nunca a navegación.
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HALLAZGO MEDIDO · el relleno rojo con texto blanco tampoco llega a 4,5 : 1
 *
 * `03-mockups.md` §5.6 estima ese par en «≈ 4,4 : 1» y añade la salida:
 * «verificar por componente y **oscurecer el relleno si no alcanza**». Medido
 * con la fórmula de WCAG 2.1, blanco sobre `#E63946` da **4,168 : 1** — por
 * debajo de AA para texto normal, que es el tamaño de la etiqueta de un botón.
 *
 * Se aplica la salida que el propio documento prevé: `marca.boton` = `#DC3341`
 * (**4,572 : 1**), el oscurecimiento más pequeño que alcanza el umbral. No es
 * un segundo rojo de marca ni un cambio de identidad: es el mismo tono un paso
 * más oscuro, y solo donde hay TEXTO encima.
 *
 * `marca.DEFAULT` se conserva intacto y sigue siendo el color dominante de la
 * pantalla, porque va donde no hay texto pequeño: filete del elemento activo,
 * pastillas de icono, barras del histograma y distintivos sobre `marca.suave`.
 * Contra blanco da 4,168 : 1, muy por encima del 3 : 1 que AA pide a un
 * componente de interfaz.
 *
 * `temas.test.ts` comprueba las parejas reales de la consola, en los DOS temas.
 * Si alguien aclara un color, la prueba dice cuál, sobre qué fondo y cuánto le
 * falta.
 */

import type { ColoresDeTailwind } from './temas';
import { TEMAS, TEMA_CLARO, TEMA_OSCURO, coloresDelPreset, variablesDeTema } from './temas';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MODO OSCURO · lo que cambia aquí y por qué no cambia nada en las pantallas
 *
 * Los colores ya no son hexadecimales: son `rgb(var(--ncr-…) / <alpha-value>)`.
 * Las variables las declara este mismo preset en la capa base, una vez por
 * tema, y el tema activo lo elige `data-tema` en `<html>`.
 *
 * La consecuencia buscada es que **ninguna de las dieciocho vistas cambia de
 * clase**: `bg-tarjeta` sigue escribiéndose igual y en oscuro vale otra cosa.
 * La alternativa —un `dark:` junto a cada color— reparte la decisión entre
 * cientos de sitios, y basta olvidarlo en uno para que quede un panel blanco
 * en mitad de la pantalla oscura.
 *
 * Las parejas fondo/texto y su verificación AA en LOS DOS temas viven en
 * `temas.ts` y `temas.test.ts`.
 */

/**
 * Paleta cruda del tema claro. Se mantiene el nombre `paleta` porque es el que
 * la ETAPA 11 traducirá a `ThemeData`; para el modo oscuro, esa traducción
 * necesita además `TEMA_OSCURO`.
 */
export const paleta = TEMA_CLARO;
export { TEMAS, TEMA_CLARO, TEMA_OSCURO };

/**
 * Escala tipográfica del mockup. Los tamaños salen medidos; los pesos, del
 * contraste observado entre niveles.
 */
export const tipografia = {
  titulo: ['1.625rem', { lineHeight: '2rem', fontWeight: '700' }],
  seccion: ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
  cifra: ['2rem', { lineHeight: '2.25rem', fontWeight: '700' }],
  /** Versalitas con `tracking` amplio: «RESIDENTES ACTIVOS». */
  etiqueta: ['0.6875rem', { lineHeight: '1rem', fontWeight: '600', letterSpacing: '0.08em' }],
  cuerpo: ['0.875rem', { lineHeight: '1.375rem', fontWeight: '400' }],
  secundario: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
  distintivo: ['0.6875rem', { lineHeight: '1rem', fontWeight: '600' }],
} as const;

export const presetTailwind = {
  theme: {
    extend: {
      colors: coloresDelPreset() as ColoresDeTailwind,
      fontFamily: {
        /**
         * Helvetica y sus derivadas, por este orden y sin descargar ninguna.
         *
         * Inter primero porque es la derivada contemporánea de la Helvetica y
         * la única de la lista con `tnum` y `cv05`: dígitos de ancho fijo —las
         * horas, las placas y los aforos alinean en columna, que con dígitos
         * proporcionales quedarían en diente de sierra— y una `l` con cola que
         * la distingue del `1` y de la `I`. En una consola donde una placa
         * decide una apertura, eso no es tipografía de gusto.
         *
         * Después Helvetica Neue (macOS), Helvetica y Arial (Windows), que son
         * la misma métrica geométrica y están YA en el equipo. Y al final la
         * pila nativa.
         *
         * **No se carga ninguna fuente web, a propósito.** Traerla de un CDN
         * obligaría a abrir `font-src` y `style-src` a un origen externo, y
         * §2.7.7 acota esas directivas a orígenes propios; autoalojarla añade
         * una descarga bloqueante al arranque. La variable `--fuente-base` deja
         * el enganche listo para cuando la ETAPA 14 autoaloje Inter con el
         * empaquetado.
         */
        sans: [
          'var(--fuente-base)',
          'Inter',
          '"Inter var"',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'sans-serif',
        ],
        // La monoespaciada para PLACAS no es decorativa: evita confundir 0/O y
        // 1/I en el dato que decide una apertura.
        mono: ['var(--fuente-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: tipografia,
      // Rejilla base de 4 px. Se añaden los pasos que el mockup usa y Tailwind
      // no trae: el ancho fijo de la barra lateral y la altura de fila de tabla.
      spacing: {
        lateral: '15rem', // 240 px
        fila: '3.25rem', // 52 px · densidad media-alta de tabla
        cabecera: '4rem',
      },
      borderRadius: {
        tarjeta: '0.875rem',
        boton: '0.5rem',
        campo: '0.5rem',
        distintivo: '0.375rem',
      },
      boxShadow: {
        // Casi planas a propósito: la jerarquía se construye con borde y fondo,
        // no con elevación. El panel lateral oscuro es el único contraste
        // fuerte de la pantalla, y competir con él la emborrona.
        // El color va por variable: en oscuro una sombra gris azulada no se
        // ve, y la que hace falta es negra y algo más marcada.
        tarjeta: '0 1px 2px 0 rgb(var(--ncr-sombra) / var(--ncr-sombra-tarjeta))',
        flotante: '0 4px 16px -2px rgb(var(--ncr-sombra) / var(--ncr-sombra-flotante))',
      },
      keyframes: {
        entrada: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        latido: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        /**
         * Despliegue de un panel anclado a su disparador —el buscador global,
         * un menú—. Se traslada **4 px y no 12**: el panel aparece pegado a lo
         * que lo abrió, así que el recorrido solo tiene que insinuar de dónde
         * sale. Un desplazamiento largo aquí lee como que el panel «viene de
         * otro sitio», que es mentira sobre su origen.
         *
         * Escala desde 0,98 y no desde 0,9 por lo mismo: a 0,9 el texto se ve
         * crecer y se lee dos veces.
         */
        desplegar: {
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        // `prefers-reduced-motion` se respeta en la hoja global, no aquí: una
        // animación declarada en el preset la usan tres superficies y solo una
        // sabe en qué contenedor vive.
        entrada: 'entrada 160ms cubic-bezier(0.23, 1, 0.32, 1)',
        latido: 'latido 2s ease-in-out infinite',
        /**
         * 120 ms: por debajo de 100 no se percibe como movimiento —aparece y
         * ya— y por encima de 200 el panel se interpone entre el usuario y lo
         * que quería ver. `ease-out` porque es una ENTRADA: arranca rápido y
         * frena, que es como se percibe una respuesta inmediata. `ease-in`
         * aquí —el error más repetido en animación de interfaz— haría que
         * pareciera que el panel tarda en reaccionar a la pulsación.
         */
        desplegar: 'desplegar 120ms cubic-bezier(0.23, 1, 0.32, 1)',
      },
      /**
       * Curvas de aceleración propias.
       *
       * Las de CSS —`ease-out`, `ease-in-out`— son deliberadamente suaves y por
       * eso se quedan cortas: el movimiento se percibe blando, «de plantilla».
       * Estas son las mismas curvas con más carácter, y la diferencia se nota
       * sobre todo en los primeros milisegundos, que es cuando el usuario está
       * mirando.
       *
       * `salida` para ENTRADAS —un panel que aparece, un menú que se despliega—:
       * arranca deprisa y frena, que es como se percibe una respuesta
       * inmediata. Nunca `ease-in` en interfaz: retrasa el movimiento justo en
       * el instante que el usuario observa, y hace que 200 ms parezcan 400.
       *
       * `entradaSalida` para lo que se MUEVE en pantalla sin aparecer ni
       * desaparecer.
       */
      transitionTimingFunction: {
        salida: 'cubic-bezier(0.23, 1, 0.32, 1)',
        entradaSalida: 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
      ringWidth: { foco: '2px' },
    },
  },
  /**
   * Las variables de tema, emitidas en la capa base.
   *
   * Se declaran aquí y no en `globals.css` porque la fuente de verdad es
   * `temas.ts`: escritas a mano en una hoja de estilos, un token añadido al
   * preset y olvidado en el CSS produce una clase que existe, compila y no
   * pinta. Recorriendo el tema no puede pasar, y `temas.test.ts` lo comprueba
   * token a token.
   *
   * **El orden de los cuatro bloques importa y es deliberado.** Todos tienen la
   * misma especificidad, así que decide el último que coincide:
   *
   *   1 · `:root`                       — claro, el valor por defecto.
   *   2 · `@media (prefers-color-scheme: dark)` sobre `:root:not([data-tema='claro'])`
   *                                      — oscuro para quien lo tiene puesto en
   *                                        el sistema y todavía no ha elegido.
   *                                        Es lo que hace que el tema sea
   *                                        correcto **sin JavaScript**.
   *   3 · `:root[data-tema='claro']`     — la elección explícita de claro gana
   *                                        sobre la preferencia del sistema.
   *                                        Sin este bloque, quien tiene el
   *                                        sistema en oscuro no podría forzar
   *                                        el claro: el `@media` lo pisaría.
   *   4 · `:root[data-tema='oscuro']`    — la elección explícita de oscuro.
   *
   * `color-scheme` va en CSS y no en JavaScript a propósito: fija el color de
   * las barras de desplazamiento y de los controles nativos, y ponerlo desde el
   * guion obligaría a escribir un atributo `style`, que la CSP de §2.7.7
   * rechaza por no llevar `unsafe-inline`.
   *
   * El `plugin` se declara como objeto plano con `handler`, que es la forma que
   * Tailwind acepta sin pasar por `tailwindcss/plugin`: este paquete sigue sin
   * importar `tailwindcss`, como exige la cabecera del fichero.
   */
  plugins: [
    {
      handler: ({ addBase }: { addBase: (estilos: EstilosBase) => void }): void => {
        addBase({
          ':root': {
            ...variablesDeTema(TEMA_CLARO),
            'color-scheme': 'light',
            '--ncr-sombra-tarjeta': '0.04',
            '--ncr-sombra-flotante': '0.10',
          },
          '@media (prefers-color-scheme: dark)': {
            ":root:not([data-tema='claro'])": {
              ...variablesDeTema(TEMA_OSCURO),
              'color-scheme': 'dark',
              '--ncr-sombra-tarjeta': '0.32',
              '--ncr-sombra-flotante': '0.48',
            },
          },
          ":root[data-tema='claro']": {
            ...variablesDeTema(TEMA_CLARO),
            'color-scheme': 'light',
            '--ncr-sombra-tarjeta': '0.04',
            '--ncr-sombra-flotante': '0.10',
          },
          ":root[data-tema='oscuro']": {
            ...variablesDeTema(TEMA_OSCURO),
            'color-scheme': 'dark',
            '--ncr-sombra-tarjeta': '0.32',
            '--ncr-sombra-flotante': '0.48',
          },
        });
      },
    },
  ],
} as const;

/** Forma mínima de lo que `addBase` acepta, sin importar los tipos de Tailwind. */
type EstilosBase = Readonly<
  Record<string, Readonly<Record<string, string | Record<string, string>>>>
>;
