/**
 * Los dos temas de la consola, declarados como **parejas de fondo y texto**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE FICHERO EXISTE Y NO BASTA CON «INVERTIR LOS COLORES»
 *
 * El modo oscuro se estropea siempre por el mismo sitio: se invierten los
 * FONDOS y se deja el texto a su suerte. El resultado es conocido —un botón
 * claro con etiqueta blanca encima, un borde que desaparece, un distintivo de
 * estado ilegible— y no lo detecta ninguna prueba, porque en ninguna parte
 * consta que ese fondo y ese texto vayan juntos.
 *
 * Aquí van juntos. `PAREJAS` declara cada combinación que existe en pantalla
 * como un objeto con su primer plano, su fondo y el umbral que debe cumplir, y
 * `temas.test.ts` la mide en **los dos temas**. Una pareja nueva sin medir no
 * se puede escribir: para pintarla hay que nombrarla aquí.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE DESTAPÓ DECLARARLAS · `bg-exito text-white`
 *
 * El botón de variante «éxito» pintaba texto blanco sobre `#10B981`. Medido:
 * **2,537 : 1**, menos de la mitad de lo que AA pide para texto normal, y en el
 * tema CLARO, que llevaba nueve pantallas dado por verificado. No lo vio la
 * suite anterior porque comprobaba colores sueltos contra superficies sueltas,
 * y ese par —relleno verde con etiqueta blanca— no estaba en la lista.
 *
 * La salida es la misma que ya se aplicó al rojo: un `exito.boton` = `#0A855C`
 * (**4,643 : 1** con blanco), el oscurecimiento más pequeño que alcanza el
 * umbral. El verde de marca `#10B981` se conserva intacto donde no lleva texto
 * encima.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO LLEGAN AL NAVEGADOR
 *
 * El preset no emite hexadecimales: emite `rgb(var(--ncr-…) / <alpha-value>)`.
 * Las variables las define el propio preset en la capa base, una vez por tema,
 * y el tema activo se elige con `data-tema` en `<html>`. Consecuencia buscada:
 * **ninguna pantalla de la consola cambia de clase**. `bg-tarjeta` sigue siendo
 * `bg-tarjeta` y en oscuro vale otra cosa. No hay `dark:` suelto que alguien
 * pueda olvidar en una de las dieciocho vistas.
 */

/** Un color en `#RRGGBB`. */
type Color = string;

/**
 * Forma de un tema. Es un `type` y no una `interface` a propósito: los alias de
 * tipo admiten firma de índice implícita, y eso es lo que permite recorrerlos
 * de forma genérica sin un `as any` por el medio.
 */
export type PaletaDeTema = {
  readonly marca: {
    readonly DEFAULT: Color;
    readonly claro: Color;
    readonly suave: Color;
    readonly oscuro: Color;
    /** Alias semántico: el que se usa para TEXTO pequeño en rojo. */
    readonly texto: Color;
    /** Relleno sólido CON etiqueta blanca encima. */
    readonly boton: Color;
    readonly presionado: Color;
  };
  readonly exito: {
    readonly DEFAULT: Color;
    readonly suave: Color;
    readonly texto: Color;
    /** Relleno sólido CON etiqueta blanca encima. Ver el hallazgo de arriba. */
    readonly boton: Color;
    /** El mismo relleno al pasar el puntero y al pulsar. */
    readonly presionado: Color;
  };
  readonly aviso: { readonly DEFAULT: Color; readonly suave: Color; readonly texto: Color };
  readonly peligro: {
    readonly DEFAULT: Color;
    readonly suave: Color;
    readonly texto: Color;
    readonly boton: Color;
  };
  readonly neutro: { readonly DEFAULT: Color; readonly suave: Color; readonly texto: Color };
  /** Barra lateral, cabecera de guardia virtual, panel de marca del acceso. */
  readonly oscuro: {
    readonly DEFAULT: Color;
    readonly profundo: Color;
    readonly elevado: Color;
    readonly secundario: Color;
    readonly borde: Color;
  };
  /** Fondo de la página. */
  readonly lienzo: Color;
  /** Fondo de tarjeta: el plano que se apoya sobre el lienzo. */
  readonly tarjeta: Color;
  /**
   * Fondo de campo de formulario. Token nuevo de la 09-B: hasta ahora los
   * catorce `<input>` y `<select>` de la consola llevaban `bg-white` literal
   * junto a `text-texto`. En claro coincide con la tarjeta y no se notaba; en
   * oscuro habría dado exactamente el fallo del encabezado —fondo blanco con
   * texto claro encima— en todos los formularios a la vez.
   */
  readonly campo: Color;
  readonly borde: { readonly DEFAULT: Color; readonly suave: Color };
  readonly texto: {
    readonly DEFAULT: Color;
    readonly fuerte: Color;
    readonly apagado: Color;
    /** Sobre superficie `oscuro.*`, que es oscura en LOS DOS temas. */
    readonly invertido: Color;
    readonly invertidoApagado: Color;
  };
  /**
   * Colores que NO cambian con el tema. Existen como token para que las
   * parejas puedan nombrarlos: `text-white` sobre un relleno saturado es
   * correcto en ambos modos, pero sigue necesitando medirse.
   */
  readonly constante: { readonly blanco: Color; readonly negro: Color };
  /** Color de la sombra de tarjeta, en canales; la opacidad va en el preset. */
  readonly sombra: Color;
};

/**
 * TEMA CLARO — el del mockup, sin cambios salvo los dos tokens nuevos
 * (`campo`, `exito.boton`) y el hallazgo que obligó a añadir el segundo.
 */
export const TEMA_CLARO: PaletaDeTema = {
  marca: {
    DEFAULT: '#E63946',
    claro: '#EA6973',
    suave: '#FEF3F3',
    oscuro: '#A23037',
    texto: '#A23037',
    boton: '#DC3341',
    presionado: '#8A2930',
  },
  exito: {
    DEFAULT: '#10B981',
    suave: '#D1FAE5',
    texto: '#047857',
    boton: '#0A855C',
    presionado: '#076B4A',
  },
  aviso: { DEFAULT: '#F59E0B', suave: '#FEF3C7', texto: '#B45309' },
  peligro: { DEFAULT: '#E63946', suave: '#FEF3F3', texto: '#A23037', boton: '#DC3341' },
  neutro: { DEFAULT: '#6B7280', suave: '#F3F4F6', texto: '#4B5563' },
  oscuro: {
    DEFAULT: '#0B0B12',
    profundo: '#040407',
    elevado: '#252542',
    secundario: '#11111E',
    borde: '#2A2A3D',
  },
  lienzo: '#F8F9FA',
  tarjeta: '#FFFFFF',
  campo: '#FFFFFF',
  borde: { DEFAULT: '#E5E7EB', suave: '#F3F4F6' },
  texto: {
    DEFAULT: '#111827',
    fuerte: '#1E1E1E',
    apagado: '#6B7280',
    invertido: '#F8F9FA',
    invertidoApagado: '#9CA3AF',
  },
  constante: { blanco: '#FFFFFF', negro: '#000000' },
  sombra: '#111827',
};

/**
 * TEMA OSCURO.
 *
 * Tres decisiones que no son obvias y conviene dejar escritas:
 *
 * 1 · **El lienzo no es negro.** `#0F0F16` en vez de `#000000`: sobre negro
 *     puro el texto claro produce halo —el ojo percibe el borde de cada letra
 *     vibrando— y las sombras dejan de existir porque no hay nada más oscuro.
 *     Es el mismo azul-violeta del panel lateral, que ya era la superficie
 *     oscura de la identidad; el tema oscuro no inventa una paleta nueva, usa
 *     la que el producto ya tenía.
 *
 * 2 · **La barra lateral queda ENTRE el lienzo y la tarjeta.** En claro es el
 *     único contraste fuerte de la pantalla; en oscuro, si conservara
 *     `#0B0B12`, se fundiría con el lienzo y la consola perdería su estructura
 *     de tres planos. Sube a `#15151F`: sigue siendo la superficie oscura, pero
 *     se distingue del fondo y de la tarjeta.
 *
 * 3 · **Los rellenos saturados no se tocan.** `marca.DEFAULT`, `marca.boton`,
 *     `exito.boton` y `peligro.boton` valen lo mismo en los dos temas. Llevan
 *     texto blanco encima, y ese par no depende del fondo de la página: si
 *     cumple en claro, cumple en oscuro. Aclararlos sólo habría cambiado la
 *     identidad a mitad de producto.
 *
 * Lo que sí cambia es todo lo que se apoya en una superficie: los `.texto` se
 * aclaran, los `.suave` pasan de pastel a tinta teñida, y cada pareja se vuelve
 * a medir.
 */
export const TEMA_OSCURO: PaletaDeTema = {
  marca: {
    DEFAULT: '#E63946',
    claro: '#F0808A',
    suave: '#2E1419',
    oscuro: '#FF9AA2',
    texto: '#FF9099',
    boton: '#DC3341',
    presionado: '#B92B36',
  },
  exito: {
    DEFAULT: '#10B981',
    suave: '#0C2A22',
    texto: '#4ADE9E',
    boton: '#0A855C',
    presionado: '#076B4A',
  },
  aviso: { DEFAULT: '#F59E0B', suave: '#2E2109', texto: '#FBBF24' },
  peligro: { DEFAULT: '#E63946', suave: '#2E1419', texto: '#FF9099', boton: '#DC3341' },
  neutro: { DEFAULT: '#6B7280', suave: '#23232F', texto: '#B5B8C4' },
  oscuro: {
    DEFAULT: '#15151F',
    profundo: '#0B0B12',
    elevado: '#2A2A45',
    secundario: '#1B1B28',
    borde: '#33334A',
  },
  lienzo: '#0F0F16',
  tarjeta: '#191924',
  campo: '#20202E',
  borde: { DEFAULT: '#33334A', suave: '#262636' },
  texto: {
    DEFAULT: '#EBECF2',
    fuerte: '#FFFFFF',
    apagado: '#A6A8B8',
    invertido: '#F8F9FA',
    invertidoApagado: '#A9ADBC',
  },
  constante: { blanco: '#FFFFFF', negro: '#000000' },
  sombra: '#000000',
};

export const TEMAS = { claro: TEMA_CLARO, oscuro: TEMA_OSCURO } as const;
export type NombreDeTema = keyof typeof TEMAS;

/* ──────────────────────────────────────────────────────────────────────────
 * Rutas de token: `'marca.texto'`, `'lienzo'`. Comprobadas por el compilador,
 * así que una pareja no puede nombrar un token que no existe.
 * ────────────────────────────────────────────────────────────────────────── */

type RutasDe<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${RutasDe<T[K]> & string}`;
    }[keyof T & string];

export type RutaDeToken = RutasDe<PaletaDeTema>;

type Nodo = Color | { readonly [clave: string]: Nodo };

const esRama = (nodo: Nodo): nodo is { readonly [clave: string]: Nodo } => typeof nodo !== 'string';

/** Resuelve `'marca.texto'` sobre un tema. Puro, sin excepciones silenciosas. */
export const colorDeToken = (tema: PaletaDeTema, ruta: RutaDeToken): Color => {
  const partes = ruta.split('.');
  let actual: Nodo = tema;
  for (const parte of partes) {
    if (!esRama(actual)) throw new Error(`ruta de token no válida: «${ruta}»`);
    const siguiente: Nodo | undefined = actual[parte];
    if (siguiente === undefined) throw new Error(`token inexistente: «${ruta}»`);
    actual = siguiente;
  }
  if (esRama(actual)) throw new Error(`«${ruta}» no es una hoja, es una rama`);
  return actual;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Parejas fondo/texto
 * ────────────────────────────────────────────────────────────────────────── */

export interface Pareja {
  /** Dónde se ve, en palabras de la interfaz y no del código. */
  readonly nombre: string;
  readonly primerPlano: RutaDeToken;
  readonly fondo: RutaDeToken;
  /** `texto` exige 4,5 : 1; `componente`, 3 : 1 (iconos, filetes, bordes). */
  readonly clase: 'texto' | 'componente';
  /**
   * Sólo para las parejas que se miden en UN tema porque en el otro no
   * existen. Vacío = se mide en los dos, que es lo normal.
   */
  readonly soloEn?: NombreDeTema;
}

/**
 * El catálogo. Cada entrada corresponde a una combinación real de la consola;
 * si se añade una pantalla con una combinación nueva, se añade aquí y se mide.
 */
export const PAREJAS: readonly Pareja[] = [
  // Texto sobre las tres superficies de la página.
  {
    nombre: 'texto principal sobre el lienzo',
    primerPlano: 'texto.DEFAULT',
    fondo: 'lienzo',
    clase: 'texto',
  },
  {
    nombre: 'texto principal sobre tarjeta',
    primerPlano: 'texto.DEFAULT',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  {
    nombre: 'texto principal dentro de un campo',
    primerPlano: 'texto.DEFAULT',
    fondo: 'campo',
    clase: 'texto',
  },
  {
    nombre: 'título fuerte sobre tarjeta',
    primerPlano: 'texto.fuerte',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  {
    nombre: 'texto apagado sobre el lienzo',
    primerPlano: 'texto.apagado',
    fondo: 'lienzo',
    clase: 'texto',
  },
  {
    nombre: 'texto apagado sobre tarjeta',
    primerPlano: 'texto.apagado',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  {
    nombre: 'marcador de posición de campo',
    primerPlano: 'texto.apagado',
    fondo: 'campo',
    clase: 'texto',
  },

  // Texto de color sobre superficie: enlaces, avisos, errores de formulario.
  {
    nombre: 'enlace y texto de marca sobre tarjeta',
    primerPlano: 'marca.texto',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  {
    nombre: 'enlace y texto de marca sobre el lienzo',
    primerPlano: 'marca.texto',
    fondo: 'lienzo',
    clase: 'texto',
  },
  {
    nombre: 'mensaje de error de campo',
    primerPlano: 'peligro.texto',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  {
    nombre: 'mensaje de error sobre el lienzo',
    primerPlano: 'peligro.texto',
    fondo: 'lienzo',
    clase: 'texto',
  },
  {
    nombre: 'aviso de segundo factor en la cabecera',
    primerPlano: 'aviso.texto',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  { nombre: 'aviso sobre el lienzo', primerPlano: 'aviso.texto', fondo: 'lienzo', clase: 'texto' },
  {
    nombre: 'confirmación en verde sobre tarjeta',
    primerPlano: 'exito.texto',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  {
    nombre: 'confirmación en verde sobre el lienzo',
    primerPlano: 'exito.texto',
    fondo: 'lienzo',
    clase: 'texto',
  },
  {
    nombre: 'texto neutro sobre tarjeta',
    primerPlano: 'neutro.texto',
    fondo: 'tarjeta',
    clase: 'texto',
  },
  {
    nombre: 'texto neutro sobre el lienzo',
    primerPlano: 'neutro.texto',
    fondo: 'lienzo',
    clase: 'texto',
  },

  // Distintivos de estado: fondo suave con SU texto. La pareja canónica.
  {
    nombre: 'distintivo «Permitido / En línea»',
    primerPlano: 'exito.texto',
    fondo: 'exito.suave',
    clase: 'texto',
  },
  {
    nombre: 'distintivo «Denegado / Falla»',
    primerPlano: 'peligro.texto',
    fondo: 'peligro.suave',
    clase: 'texto',
  },
  {
    nombre: 'distintivo «Pendiente / Degradado»',
    primerPlano: 'aviso.texto',
    fondo: 'aviso.suave',
    clase: 'texto',
  },
  {
    nombre: 'distintivo neutro',
    primerPlano: 'neutro.texto',
    fondo: 'neutro.suave',
    clase: 'texto',
  },
  {
    nombre: 'distintivo de marca',
    primerPlano: 'marca.texto',
    fondo: 'marca.suave',
    clase: 'texto',
  },
  {
    nombre: 'placa en monoespaciada',
    primerPlano: 'marca.texto',
    fondo: 'marca.suave',
    clase: 'texto',
  },

  // Rellenos sólidos con etiqueta blanca. Iguales en ambos temas, medidos igual.
  {
    nombre: 'botón primario',
    primerPlano: 'constante.blanco',
    fondo: 'marca.boton',
    clase: 'texto',
  },
  {
    nombre: 'botón primario pulsado',
    primerPlano: 'constante.blanco',
    fondo: 'marca.presionado',
    clase: 'texto',
  },
  {
    nombre: 'botón de acción destructiva',
    primerPlano: 'constante.blanco',
    fondo: 'peligro.boton',
    clase: 'texto',
  },
  {
    nombre: 'botón de confirmación',
    primerPlano: 'constante.blanco',
    fondo: 'exito.boton',
    clase: 'texto',
  },
  {
    nombre: 'botón de confirmación pulsado',
    primerPlano: 'constante.blanco',
    fondo: 'exito.presionado',
    clase: 'texto',
  },
  {
    nombre: 'enlace de salto al contenido',
    primerPlano: 'constante.blanco',
    fondo: 'marca.boton',
    clase: 'texto',
  },

  // Botón secundario: es la pareja que el modo oscuro rompe si el campo se deja
  // en blanco literal.
  { nombre: 'botón secundario', primerPlano: 'texto.DEFAULT', fondo: 'campo', clase: 'texto' },

  // Superficie oscura: barra lateral y panel de marca del acceso. Oscura en los
  // DOS temas, así que estas parejas se miden dos veces y deben cumplir dos.
  {
    nombre: 'navegación de la barra lateral',
    primerPlano: 'texto.invertido',
    fondo: 'oscuro.DEFAULT',
    clase: 'texto',
  },
  {
    nombre: 'navegación sobre el panel profundo',
    primerPlano: 'texto.invertido',
    fondo: 'oscuro.profundo',
    clase: 'texto',
  },
  {
    nombre: 'elemento activo de la navegación',
    primerPlano: 'texto.invertido',
    fondo: 'oscuro.elevado',
    clase: 'texto',
  },
  {
    nombre: 'pie de la barra lateral',
    primerPlano: 'texto.invertido',
    fondo: 'oscuro.secundario',
    clase: 'texto',
  },
  {
    nombre: 'subtítulo de la barra lateral',
    primerPlano: 'texto.invertidoApagado',
    fondo: 'oscuro.DEFAULT',
    clase: 'texto',
  },
  {
    nombre: 'subtítulo sobre el panel profundo',
    primerPlano: 'texto.invertidoApagado',
    fondo: 'oscuro.profundo',
    clase: 'texto',
  },
  {
    nombre: 'subtítulo del elemento activo',
    primerPlano: 'texto.invertidoApagado',
    fondo: 'oscuro.elevado',
    clase: 'texto',
  },
  {
    nombre: 'subtítulo del pie de la barra lateral',
    primerPlano: 'texto.invertidoApagado',
    fondo: 'oscuro.secundario',
    clase: 'texto',
  },

  // Componentes: filetes, iconos y anillos de foco. 3 : 1.
  {
    nombre: 'filete rojo del elemento activo',
    primerPlano: 'marca.DEFAULT',
    fondo: 'oscuro.elevado',
    clase: 'componente',
  },
  {
    nombre: 'icono de marca sobre tarjeta',
    primerPlano: 'marca.DEFAULT',
    fondo: 'tarjeta',
    clase: 'componente',
  },
  {
    nombre: 'icono de marca sobre el lienzo',
    primerPlano: 'marca.DEFAULT',
    fondo: 'lienzo',
    clase: 'componente',
  },
  {
    nombre: 'barra del histograma sobre tarjeta',
    primerPlano: 'marca.DEFAULT',
    fondo: 'tarjeta',
    clase: 'componente',
  },
  {
    nombre: 'anillo de foco sobre el lienzo',
    primerPlano: 'marca.texto',
    fondo: 'lienzo',
    clase: 'componente',
  },
  {
    nombre: 'anillo de foco sobre tarjeta',
    primerPlano: 'marca.texto',
    fondo: 'tarjeta',
    clase: 'componente',
  },
  {
    nombre: 'anillo de foco sobre superficie oscura',
    primerPlano: 'constante.blanco',
    fondo: 'oscuro.DEFAULT',
    clase: 'componente',
  },
  {
    nombre: 'borde de campo con error',
    primerPlano: 'peligro.texto',
    fondo: 'campo',
    clase: 'componente',
  },
  {
    nombre: 'icono de éxito sobre tarjeta',
    primerPlano: 'exito.texto',
    fondo: 'tarjeta',
    clase: 'componente',
  },

  /**
   * NO está en la lista, y conviene decir por qué: el separador entre la barra
   * lateral y el contenido (`oscuro.borde` sobre `oscuro.DEFAULT`) da 1,478 : 1.
   * AA 1.4.11 exige 3 : 1 a lo que identifica un COMPONENTE o su estado, no a un
   * filete decorativo entre dos planos que ya se distinguen por su fondo. Subirlo
   * a 3 : 1 pondría una línea gris clara cruzando la pantalla. Se deja medido y
   * fuera, que es distinto de no haberlo mirado.
   */
];

/* ──────────────────────────────────────────────────────────────────────────
 * Del tema a CSS
 *
 * Los valores se emiten como canales sueltos —`230 57 70`— y no como
 * `#E63946`, para que el preset pueda escribir `rgb(var(--ncr-marca) /
 * <alpha-value>)` y los modificadores de opacidad de Tailwind sigan
 * funcionando. La consola ya usa `bg-oscuro/50` y `ring-marca/20`: con la
 * variable guardada en hexadecimal, esas cinco clases habrían dejado de pintar
 * sin que nada fallara.
 * ────────────────────────────────────────────────────────────────────────── */

/** `#E63946` → `230 57 70`. */
export const canales = (hex: Color): string => {
  const limpio = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) {
    throw new Error(`color no válido: «${hex}»; se espera #RRGGBB`);
  }
  return [0, 2, 4].map((p) => Number.parseInt(limpio.slice(p, p + 2), 16)).join(' ');
};

/** `['marca','DEFAULT']` → `--ncr-marca`; `['texto','apagado']` → `--ncr-texto-apagado`. */
const nombreDeVariable = (ruta: readonly string[]): string =>
  `--ncr-${ruta.filter((p) => p !== 'DEFAULT').join('-')}`;

const recorrer = (
  nodo: Nodo,
  ruta: readonly string[],
  visita: (ruta: readonly string[], valor: Color) => void,
): void => {
  if (!esRama(nodo)) {
    visita(ruta, nodo);
    return;
  }
  for (const clave of Object.keys(nodo)) {
    const hijo = nodo[clave];
    if (hijo !== undefined) recorrer(hijo, [...ruta, clave], visita);
  }
};

/** Declaraciones CSS de un tema: `{ '--ncr-marca': '230 57 70', … }`. */
export const variablesDeTema = (tema: PaletaDeTema): Readonly<Record<string, string>> => {
  const salida: Record<string, string> = {};
  recorrer(tema, [], (ruta, valor) => {
    salida[nombreDeVariable(ruta)] = canales(valor);
  });
  return salida;
};

export type ColoresDeTailwind = { [clave: string]: string | ColoresDeTailwind };

/**
 * La misma forma del tema, con cada hoja sustituida por su referencia a la
 * variable. Se deriva del tema y no se escribe a mano: así es imposible que
 * exista un token en CSS que Tailwind no conozca, o al revés.
 */
export const coloresDelPreset = (): ColoresDeTailwind => {
  const salida: ColoresDeTailwind = {};
  recorrer(TEMA_CLARO, [], (ruta, _valor) => {
    let destino = salida;
    for (const parte of ruta.slice(0, -1)) {
      const siguiente: string | ColoresDeTailwind | undefined = destino[parte];
      if (typeof siguiente === 'object') {
        destino = siguiente;
      } else {
        const rama: ColoresDeTailwind = {};
        destino[parte] = rama;
        destino = rama;
      }
    }
    const hoja = ruta[ruta.length - 1];
    if (hoja !== undefined) destino[hoja] = `rgb(var(${nombreDeVariable(ruta)}) / <alpha-value>)`;
  });
  return salida;
};
