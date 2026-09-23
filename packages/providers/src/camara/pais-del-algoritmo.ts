import { entero, etiqueta, opciones, reemplazarEtiqueta } from '../equipo/xml';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PAÍS DEL ALGORITMO · lo que decide si la cámara LEE BIEN
 *
 * El canal de tráfico lleva un índice de reconocimiento que fija **la gramática
 * de placa** que el algoritmo aplica. Colombia es **210**. Con el genérico
 * (`0`), el equipo lee placas colombianas con una gramática que no es la suya:
 * confunde caracteres, parte mal el grupo de letras y dígitos, y devuelve
 * lecturas plausibles y equivocadas.
 *
 * Y ése es el problema: **no falla, acierta poco**. El síntoma en sitio no es
 * un error, es «la cámara lee mal» — que manda a revisar el enfoque, la luz, la
 * altura y el ángulo antes de que a nadie se le ocurra mirar un campo de
 * configuración. Por eso se lee, se compara y se dice; y por eso está aquí y no
 * en una lista de comprobación de la guía.
 *
 * `253` es «inválido» y `254` «no reconocido»: ninguno de los dos es un país,
 * y tratarlos como tal daría por configurado algo que no lo está.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES CAUTELAS AL ESCRIBIR, Y LAS TRES SALEN DEL PROPIO DOCUMENTO
 *
 * 1 · **Capacidades primero.** Lo que ese equipo admite lo dice su `opt=`. Si
 *     210 no está en la lista, se dice y **no se escribe**: enviar un valor que
 *     el equipo no soporta produce un rechazo cuyo mensaje no nombra el campo.
 * 2 · **Leer-modificar-escribir, obligatorio.** El `PUT` exige el documento
 *     básico COMPLETO —canal, sentido, sitio, identificador, descripción, canal
 *     por omisión, región e índice—. No hay forma de enviar sólo el índice, y
 *     enviar el resto en blanco borra la identificación del punto de captura.
 * 3 · **El índice manda sobre el país**, lo dice el documento. Cuando sólo
 *     viene el país y vale «inválido», el propio documento dice que hace falta
 *     lógica adicional: eso **se reporta**, no se adivina.
 *
 * Y la región: el mismo capítulo la enumera de dos formas distintas (C-17). Por
 * eso nunca se envía una región fija — se devuelve **la que vino**.
 */

export const PAIS_COLOMBIA = 210;

/** Valores que no son un país. */
export const INDICE_GENERICO = 0;
export const INDICE_INVALIDO = 253;
export const INDICE_NO_RECONOCIDO = 254;

/** Longitudes que el esquema declara para los campos de identificación. */
export const LONGITUD_DE_IDENTIFICACION = { minima: 1, maxima: 10 } as const;

/**
 * Sentido del carril, tal como el equipo lo declara. Se mapea al punto de
 * acceso: una cámara de salida que se registre como de entrada produce un
 * histórico que cuenta al revés, y nadie lo nota hasta que el aforo no cuadra.
 */
export const SENTIDOS = [
  'Upward',
  'downward',
  'bidirectional',
  'westward',
  'northward',
  'eastward',
  'southward',
] as const;
export type SentidoDeCarril = (typeof SENTIDOS)[number];

export interface DatosBasicosDelCanal {
  readonly canalId: number | null;
  readonly sentido: string | null;
  readonly sitio: string | null;
  readonly equipoId: string | null;
  readonly descripcion: string | null;
  readonly canalPorOmision: string | null;
  readonly region: string | null;
  readonly indiceDeReconocimiento: number | null;
  readonly paisDeclarado: number | null;
}

export const leerDatosBasicos = (cuerpo: string): DatosBasicosDelCanal => ({
  canalId: entero(etiqueta(cuerpo, 'channelID')),
  sentido: etiqueta(cuerpo, 'directionNo'),
  sitio: etiqueta(cuerpo, 'monitoringSiteID'),
  equipoId: etiqueta(cuerpo, 'deviceID'),
  descripcion: etiqueta(cuerpo, 'monitorDescription'),
  canalPorOmision: etiqueta(cuerpo, 'defaultCHN'),
  region: etiqueta(cuerpo, 'region'),
  indiceDeReconocimiento: entero(etiqueta(cuerpo, 'CRIndex')),
  paisDeclarado: entero(etiqueta(cuerpo, 'countryIndex')),
});

export type ClaseDePais =
  | 'correcto'
  | 'otro_pais'
  | 'generico'
  | 'sin_declarar'
  | 'no_soportado'
  | 'ilegible';

export interface VeredictoDePais {
  readonly clase: ClaseDePais;
  readonly indiceLeido: number | null;
  readonly indiceEsperado: number;
  /** `true` sólo cuando el equipo declara admitir el índice esperado. */
  readonly admiteElEsperado: boolean;
  /** `true` cuando se puede escribir sin riesgo de rechazo por capacidad. */
  readonly corregible: boolean;
  readonly detalle: string;
}

/**
 * Juzga el país del algoritmo.
 *
 * `capacidades` es el cuerpo de la consulta de capacidades del canal, del que
 * sale la lista de índices admitidos. Se pasa aparte —y no se deduce— porque
 * **no saber qué admite el equipo no es lo mismo que saber que no admite**:
 * cuando la lista viene vacía se dice, y no se escribe a ciegas.
 */
export const juzgarPais = (
  basicos: DatosBasicosDelCanal,
  capacidades: string,
  esperado: number = PAIS_COLOMBIA,
): VeredictoDePais => {
  const admitidos = opciones(capacidades, 'CRIndex').map((v) => Number(v));
  const admiteElEsperado = admitidos.includes(esperado);
  const indice = basicos.indiceDeReconocimiento;

  const base = { indiceLeido: indice, indiceEsperado: esperado, admiteElEsperado };

  if (indice === null) {
    // El índice manda sobre el país declarado. Si sólo viene el país y es
    // «inválido», el propio documento dice que hace falta lógica adicional: se
    // reporta con esas palabras en vez de inventarla.
    const pais = basicos.paisDeclarado;
    return {
      ...base,
      clase: 'sin_declarar',
      corregible: admiteElEsperado,
      detalle:
        pais === INDICE_INVALIDO
          ? 'El equipo no declara índice de reconocimiento y su país declarado es «inválido». ' +
            'El fabricante dice que ese caso necesita lógica adicional: queda REPORTADO, no ' +
            'resuelto por nuestra cuenta'
          : 'El equipo no declara el índice de reconocimiento de placa. Sin él no se puede ' +
            'afirmar con qué gramática lee, y una lectura equivocada parece un problema de ' +
            'enfoque o de luz',
    };
  }

  if (indice === esperado) {
    return {
      ...base,
      clase: 'correcto',
      corregible: false,
      detalle: `El algoritmo lee con la gramática de placa del país ${String(esperado)}`,
    };
  }

  if (indice === INDICE_GENERICO || indice === INDICE_INVALIDO || indice === INDICE_NO_RECONOCIDO) {
    return {
      ...base,
      clase: 'generico',
      corregible: admiteElEsperado,
      detalle:
        `El algoritmo NO tiene país configurado (índice ${String(indice)}). Leerá placas con ` +
        'una gramática genérica: no dará error, acertará poco, y el síntoma parecerá de ' +
        `enfoque o de luz. Debe ser ${String(esperado)}` +
        (admiteElEsperado ? '' : ', y este equipo NO declara admitirlo'),
    };
  }

  return {
    ...base,
    clase: admitidos.length > 0 && !admiteElEsperado ? 'no_soportado' : 'otro_pais',
    corregible: admiteElEsperado,
    detalle:
      `El algoritmo está configurado para otro país (índice ${String(indice)}) y debe ser ` +
      `${String(esperado)}` +
      (admitidos.length === 0
        ? '. El equipo no declaró qué índices admite, así que no se escribe a ciegas'
        : admiteElEsperado
          ? ''
          : '. Este equipo NO declara admitir ese índice: no se escribe'),
  };
};

/**
 * Documento básico con el índice cambiado y **todo lo demás intacto**.
 *
 * `null` si el documento no trae el campo: añadirlo al final produciría un
 * documento que el equipo rechaza por orden de elementos, con un error que no
 * dice cuál era el problema.
 */
export const conPaisCorregido = (cuerpo: string, indice: number = PAIS_COLOMBIA): string | null =>
  reemplazarEtiqueta(cuerpo, 'CRIndex', String(indice));

/**
 * Comprueba que el documento que vamos a escribir conserva lo obligatorio.
 *
 * Es la red que hace de leer-modificar-escribir una disciplina verificable en
 * vez de una intención: devuelve qué campos obligatorios faltan, y quien
 * escribe se niega si la lista no está vacía.
 */
export const camposObligatoriosQueFaltan = (cuerpo: string): readonly string[] =>
  [
    'channelID',
    'directionNo',
    'monitoringSiteID',
    'deviceID',
    'monitorDescription',
    'defaultCHN',
    'region',
    'CRIndex',
  ].filter((campo) => etiqueta(cuerpo, campo) === null);
