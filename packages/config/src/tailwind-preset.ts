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
 * `contraste.test.ts` comprueba los quince pares reales de la consola. Si
 * alguien aclara un color, la prueba dice cuál y cuánto le falta.
 */

/** Paleta cruda. Se exporta aparte para que la ETAPA 11 la traduzca a Dart. */
export const paleta = {
  marca: {
    DEFAULT: '#E63946',
    claro: '#EA6973',
    suave: '#FEF3F3',
    oscuro: '#A23037',
    /** Alias semántico de `oscuro`: el que se usa para TEXTO pequeño (AA). */
    texto: '#A23037',
    /** Relleno sólido CON etiqueta blanca encima. Ver el hallazgo de arriba. */
    boton: '#DC3341',
    presionado: '#8A2930',
  },
  exito: { DEFAULT: '#10B981', suave: '#D1FAE5', texto: '#047857' },
  aviso: { DEFAULT: '#F59E0B', suave: '#FEF3C7', texto: '#B45309' },
  peligro: { DEFAULT: '#E63946', suave: '#FEF3F3', texto: '#A23037', boton: '#DC3341' },
  neutro: { DEFAULT: '#6B7280', suave: '#F3F4F6', texto: '#4B5563' },
  /** Barra lateral, cabecera de guardia virtual, panel de marca del login. */
  oscuro: {
    DEFAULT: '#0B0B12',
    profundo: '#040407',
    elevado: '#252542',
    secundario: '#11111E',
    borde: '#2A2A3D',
  },
  lienzo: '#F8F9FA',
  tarjeta: '#FFFFFF',
  borde: { DEFAULT: '#E5E7EB', suave: '#F3F4F6' },
  texto: {
    DEFAULT: '#111827',
    fuerte: '#1E1E1E',
    apagado: '#6B7280',
    /** Sobre superficie oscura. */
    invertido: '#F8F9FA',
    invertidoApagado: '#9CA3AF',
  },
} as const;

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
      colors: paleta,
      fontFamily: {
        // Inter con `tnum`: las horas, las placas y los aforos alinean en
        // columna. Con dígitos proporcionales una tabla de horas queda en
        // diente de sierra y cuesta leerla de un vistazo.
        sans: ['var(--fuente-inter)', 'Inter', 'system-ui', 'sans-serif'],
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
        tarjeta: '0 1px 2px 0 rgb(17 24 39 / 0.04)',
        flotante: '0 4px 16px -2px rgb(17 24 39 / 0.10)',
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
        entrada: 'entrada 160ms ease-out',
        latido: 'latido 2s ease-in-out infinite',
        /**
         * 120 ms: por debajo de 100 no se percibe como movimiento —aparece y
         * ya— y por encima de 200 el panel se interpone entre el usuario y lo
         * que quería ver. `ease-out` porque es una ENTRADA: arranca rápido y
         * frena, que es como se percibe una respuesta inmediata. `ease-in`
         * aquí —el error más repetido en animación de interfaz— haría que
         * pareciera que el panel tarda en reaccionar a la pulsación.
         */
        desplegar: 'desplegar 120ms ease-out',
      },
      ringWidth: { foco: '2px' },
    },
  },
} as const;
