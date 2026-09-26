import type { Rol } from '../autenticacion';
import {
  codigoCortoEfectivo,
  telefonoEfectivo,
  validarCodigoCorto,
  validarTelefonoPorteria,
  validarTopeVehiculos,
} from './ajustes-de-plataforma';

/**
 * Qué se puede configurar de una copropiedad, quién puede tocarlo y qué se
 * queda en solo lectura **con el motivo a la vista**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN CATÁLOGO Y NO UN PUÑADO DE `if`
 *
 * La pregunta «¿quién puede cambiar esto?» se responde una vez, en un sitio, y
 * la responden a la vez la API —que es quien decide— y la consola —que es quien
 * pinta el campo deshabilitado y explica por qué—. Con la regla repartida, lo
 * que ocurre siempre es que la consola deja escribir un campo que el servidor
 * rechaza, o peor: que la consola oculta un campo que el servidor sí acepta, y
 * entonces la restricción no existe, solo lo parece.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO SE EDITA, Y NO POR PEREZA
 *
 * Tres clases de ajuste se quedan fuera, y cada una lleva su motivo escrito
 * para que la pantalla pueda mostrarlo:
 *
 *  · **Cota legal.** El plazo de consentimiento biométrico lo fija la Ley 1581
 *    de 2012 como MÁXIMO —24 horas—, no como valor por defecto. Un campo aquí
 *    invitaría a subirlo, que es justo lo que la ley prohíbe.
 *  · **Integridad.** El NIT identifica fiscalmente a la copropiedad y sostiene
 *    un índice único; cambiarlo no es configurar, es sustituir el tenant.
 *  · **Trazabilidad.** El margen de caché del Edge decide cuándo una decisión
 *    tomada sin WAN se marca como potencialmente obsoleta (KPI-31). Aflojarlo
 *    desde una pantalla degradaría en silencio la auditoría de la ETAPA 12.
 *
 * «Solo lectura con el motivo visible» y «oculto» no son lo mismo: lo oculto
 * parece que no existe y acaba pedido otra vez; lo visible con su razón cierra
 * la conversación.
 */

export type ClaveEditable =
  | 'nombre'
  | 'direccion'
  | 'tipo'
  | 'etiquetaVivienda'
  | 'etiquetaAgrupacion'
  | 'zonaHoraria'
  | 'politicaContingenciaEdge'
  | 'codigoCorto'
  | 'telefonoPorteria'
  | 'topeVehiculosPropios';

export type PoliticaContingencia = 'denegar' | 'escalar_portero';

/**
 * Tipo de conjunto. Enumerado y no texto libre —al revés que las etiquetas—
 * porque DECIDE COMPORTAMIENTO: qué formulario de alta se muestra y qué
 * generador se ejecuta. Un valor que el código no conoce no tendría formulario.
 */
export const TIPOS_DE_COPROPIEDAD = ['apartamentos', 'casas', 'fincas', 'otro'] as const;
export type TipoDeCopropiedad = (typeof TIPOS_DE_COPROPIEDAD)[number];

/**
 * Etiquetas sugeridas por tipo. **Sugeridas, no impuestas**: el conjunto
 * escribe la suya y por eso son texto libre. Un desplegable cerrado con cinco
 * palabras obliga a elegir mal al primero que use «manzana y lote» a la vez.
 */
export const ETIQUETAS_SUGERIDAS: Readonly<
  Record<TipoDeCopropiedad, { vivienda: string; agrupacion: string }>
> = {
  apartamentos: { vivienda: 'Apartamento', agrupacion: 'Torre' },
  casas: { vivienda: 'Casa', agrupacion: 'Sección' },
  fincas: { vivienda: 'Finca', agrupacion: 'Sector' },
  otro: { vivienda: 'Vivienda', agrupacion: 'Agrupación' },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * B.5 · DOS AJUSTES QUE DEJAN DE SER AJUSTES (ETAPA 15-B)
 *
 * El «umbral de confianza de placa» y el «margen de latido» salían de esta
 * pantalla, y no debían. Un campo de formulario dice «esto es tuyo, elige»; y
 * ninguno de los dos lo es:
 *
 *  · **El umbral de confianza no era un número del conjunto: era un número del
 *    fabricante.** La cámara publica `confidenceLevel` en la escala 0–100 del
 *    evento ANPR, y el criterio de qué lectura decide sola sale de ahí, no del
 *    gusto de un administrador. Mientras fue editable, el valor por omisión
 *    —0,85— eran **centésimas inventadas**: nadie podía decir de dónde salía.
 *    Ahora sale de la documentación del equipo y está escrito aquí.
 *  · **El margen de latido no es independiente**: la base ya lo ata al periodo
 *    de latido y a los latidos tolerados con una restricción de coherencia
 *    (`copropiedades_umbral_latido_coherente`, migración 0020). Dejar que se
 *    escribiera por separado permitía contradecir esa restricción desde una
 *    pantalla, y entonces el rechazo llegaba como un error de base de datos que
 *    no le sirve a nadie.
 *
 * Los dos siguen **viéndose** en la pantalla con su motivo, que es la diferencia
 * entre «solo lectura» y «oculto» que este mismo fichero defiende más arriba.
 * Cambiarlos ahora exige una migración, que es exactamente lo que debe costar.
 *
 * P-02 queda RESUELTA (el umbral tiene respaldo documental) y P-06 SUSTITUIDA
 * (ya no se busca dónde ponerlo en la pantalla: no va en la pantalla).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Umbral de confianza de lectura de placa, **en la escala del evento ANPR**
 * (`confidenceLevel`, 0–100). Por debajo de este valor la lectura NO decide
 * sola: escala al portero (CU-01, excepción 3a).
 */
export const UMBRAL_CONFIANZA_PLACA_ANPR = 80;

/**
 * El mismo umbral como fracción, que es como lo expresa el dominio
 * (`contexto.umbralDeConfianza`, 0–1) y como lo guarda la columna
 * `umbral_confianza_placa numeric(4,3)`. Se deriva, no se escribe dos veces:
 * dos literales que significan lo mismo acaban divergiendo.
 */
export const UMBRAL_CONFIANZA_PLACA_FRACCION = UMBRAL_CONFIANZA_PLACA_ANPR / 100;

/** Margen de latido de dispositivo, en minutos. Ver el bloque de arriba. */
export const MARGEN_LATIDO_MINUTOS = 5;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * B.4 · LA DIRECCIÓN SE VALIDA, Y CADA CAUSA DICE LO SUYO
 *
 * Antes bastaban cinco caracteres cualesquiera: «aaaaa» pasaba, y también el
 * nombre del conjunto escrito por error en el campo equivocado —que es
 * justamente lo que ocurrió (B.3)—. Una dirección colombiana tiene siempre las
 * dos cosas: una vía («Calle», «Carrera», «Km») y un número. Exigir ambas no es
 * cosmética: es lo que distingue una dirección de una etiqueta.
 *
 * El saneamiento es el de §2.7.4 y va ANTES de medir: se recorta, se normaliza
 * a Unicode NFC y se quitan los caracteres de control y el byte nulo. Sin eso,
 * una cadena de ocho caracteres de control pasaría por dirección, y lo que se
 * guardaría no sería lo que se midió.
 *
 * **Un mensaje por causa.** «No es válida» obliga a adivinar; «le falta el
 * número» se corrige a la primera.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export const DIRECCION_MINIMA = 8;
export const DIRECCION_MAXIMA = 200;

/** Saneamiento de §2.7.4, aplicado antes de medir y antes de persistir. */
export const sanearTexto = (valor: string): string =>
  valor
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- es justo lo que hay que quitar
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

export const validarDireccion = (valor: string | number): string | null => {
  if (typeof valor !== 'string') return 'se esperaba texto';
  const limpio = sanearTexto(valor);
  if (limpio.length === 0) return 'la dirección no puede quedar vacía';
  if (limpio.length < DIRECCION_MINIMA) {
    return `una dirección necesita al menos ${String(DIRECCION_MINIMA)} caracteres: «Cl 4 # 5-6» los tiene`;
  }
  if (limpio.length > DIRECCION_MAXIMA) {
    return `no puede pasar de ${String(DIRECCION_MAXIMA)} caracteres`;
  }
  if (!/\p{L}/u.test(limpio)) return 'le falta la vía: «Calle», «Carrera», «Km»…';
  if (!/\d/.test(limpio)) return 'le falta el número: una dirección lleva al menos una cifra';
  return null;
};

/** Lo que la consola pinta: lo editable y lo que solo se consulta. */
export interface ConfiguracionDeCopropiedad {
  readonly nombre: string;
  /**
   * Dirección **del conjunto**. La vivienda no tiene la suya: en Colombia la
   * dirección es de la copropiedad y lo que cambia es la agrupación y el
   * número. `null` mientras nadie la haya escrito.
   */
  readonly direccion: string | null;
  /** `null` = sin configurar. Es lo que dispara el diálogo inicial. */
  readonly tipo: TipoDeCopropiedad | null;
  readonly etiquetaVivienda: string;
  readonly etiquetaAgrupacion: string;
  readonly zonaHoraria: string;
  readonly politicaContingenciaEdge: PoliticaContingencia;
  /** D1 · `null` mientras el superadministrador no lo asigne: sin él sólo se entra por NIT. */
  readonly codigoCorto: string | null;
  /** D7 · `null` = la app dice «portería no ha registrado su teléfono». */
  readonly telefonoPorteria: string | null;
  /** D5 a · vehículos propios activos que los ocupantes registran por vivienda. */
  readonly topeVehiculosPropios: number;
  /* ── Solo lectura ── */
  /** D5 c · ADR-027 · hoy sólo «automatica»; el modo del portero no está construido. */
  readonly aprobacionDeTerceros: 'automatica';
  /**
   * Se siguen exponiendo para que la pantalla los MUESTRE con su motivo; ya no
   * se editan (ETAPA 15-B, B.5). Lo que la consola recibe es el valor efectivo,
   * que es el de la constante documentada.
   */
  readonly umbralConfianzaPlaca: number;
  readonly umbralLatidoMinutos: number;
  readonly nit: string;
  readonly estado: string;
  readonly plazoConsentimientoHoras: number;
  readonly margenCacheReglasHoras: number;
  readonly versionReglasActual: number;
}

/**
 * Lote de cambios, con el tipo exacto de cada ajuste. Se escribe campo a campo
 * y no como `Partial<Record<…>>` porque ese atajo hace que todo valga
 * `string | number`, y entonces el compilador no puede distinguir un nombre de
 * un umbral: la comprobación se pierde justo donde importa.
 */
export interface CambiosDeConfiguracion {
  readonly nombre?: string;
  readonly direccion?: string;
  readonly tipo?: TipoDeCopropiedad;
  readonly etiquetaVivienda?: string;
  readonly etiquetaAgrupacion?: string;
  readonly zonaHoraria?: string;
  readonly politicaContingenciaEdge?: PoliticaContingencia;
  readonly codigoCorto?: string;
  /** Vacío borra el teléfono; por eso el efectivo admite `null`. */
  readonly telefonoPorteria?: string | null;
  readonly topeVehiculosPropios?: number;
}

export interface Ajuste {
  readonly clave: ClaveEditable;
  readonly etiqueta: string;
  /** Roles que pueden cambiarlo. El resto lo ve, no lo toca. */
  readonly editablePor: readonly Rol[];
  /**
   * Verdad de negocio, no forma: el DTO ya comprobó que es un número o una
   * cadena. Devuelve el motivo del rechazo, o `null` si el valor vale.
   */
  readonly validar: (valor: string | number) => string | null;
}

const textoAcotado =
  (minimo: number, maximo: number) =>
  (valor: string | number): string | null => {
    if (typeof valor !== 'string') return 'se esperaba texto';
    const limpio = valor.trim();
    if (limpio.length < minimo) return `no puede tener menos de ${String(minimo)} caracteres`;
    if (limpio.length > maximo) return `no puede pasar de ${String(maximo)} caracteres`;
    return null;
  };

/**
 * Las zonas horarias se comprueban contra las que conoce **este** proceso, con
 * la API de internacionalización, y no contra una lista escrita a mano que
 * envejecería. La base vuelve a comprobarlo con `app.es_zona_horaria`: si las
 * dos discrepan, manda la base y la API devuelve el error, que es el orden
 * correcto —§2.7.3, el DTO valida forma y el agregado valida verdad—.
 */
const ZONAS_CONOCIDAS: ReadonlySet<string> = new Set(
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [],
);

const AJUSTES: readonly Ajuste[] = [
  {
    clave: 'nombre',
    etiqueta: 'Nombre de la copropiedad',
    editablePor: ['superadministrador', 'administrador'],
    validar: textoAcotado(1, 200),
  },
  {
    clave: 'direccion',
    etiqueta: 'Dirección del conjunto',
    editablePor: ['superadministrador', 'administrador'],
    validar: validarDireccion,
  },
  {
    clave: 'tipo',
    /**
     * **Se puede cambiar después, y las viviendas ya creadas no se enteran.**
     * Se lee en dos sitios —el formulario de generación y la etiqueta sugerida—
     * y ninguna vivienda lo guarda. Esa es la condición que hace segura esta
     * respuesta, y el analizador de fronteras la vigila: si un día apareciera
     * en el dominio, dejaría de ser cierta.
     */
    etiqueta: 'Tipo de copropiedad',
    editablePor: ['superadministrador', 'administrador'],
    validar: (valor) =>
      typeof valor === 'string' && (TIPOS_DE_COPROPIEDAD as readonly string[]).includes(valor)
        ? null
        : `debe ser uno de: ${TIPOS_DE_COPROPIEDAD.join(', ')}`,
  },
  {
    clave: 'etiquetaVivienda',
    /**
     * Cambiarla **no renombra nada**: la palabra nunca estuvo dentro del
     * identificador (H-3). Repinta el directorio, el buscador y la ficha, y no
     * toca una sola fila.
     */
    etiqueta: 'Cómo se llama una vivienda aquí',
    editablePor: ['superadministrador', 'administrador'],
    validar: textoAcotado(1, 24),
  },
  {
    clave: 'etiquetaAgrupacion',
    etiqueta: 'Cómo se llama la agrupación aquí',
    editablePor: ['superadministrador', 'administrador'],
    validar: textoAcotado(1, 24),
  },
  {
    clave: 'zonaHoraria',
    etiqueta: 'Zona horaria',
    editablePor: ['superadministrador', 'administrador'],
    validar: (valor) => {
      if (typeof valor !== 'string') return 'se esperaba texto';
      if (ZONAS_CONOCIDAS.size > 0 && !ZONAS_CONOCIDAS.has(valor)) {
        return 'no es una zona horaria de la base de datos IANA';
      }
      return null;
    },
  },
  {
    clave: 'politicaContingenciaEdge',
    /**
     * Igual: es la respuesta del Edge cuando la regla NO está en su caché
     * (RN-16). «Denegar» es el valor conservador que §2.1.4 impone por defecto;
     * cambiarlo a «escalar» es una decisión de operación con consecuencias de
     * seguridad.
     */
    etiqueta: 'Contingencia del Edge sin regla en caché',
    editablePor: ['superadministrador'],
    validar: (valor) =>
      valor === 'denegar' || valor === 'escalar_portero'
        ? null
        : 'debe ser «denegar» o «escalar_portero»',
  },
  // ETAPA 15-I · los tres de plataforma: su verdad vive en `ajustes-de-plataforma.ts`.
  {
    clave: 'codigoCorto',
    etiqueta: 'Código de acceso de la copropiedad',
    editablePor: ['superadministrador'],
    validar: validarCodigoCorto,
  },
  {
    clave: 'telefonoPorteria',
    etiqueta: 'Teléfono de portería',
    editablePor: ['superadministrador'],
    validar: validarTelefonoPorteria,
  },
  {
    clave: 'topeVehiculosPropios',
    etiqueta: 'Vehículos propios por vivienda',
    editablePor: ['superadministrador'],
    validar: validarTopeVehiculos,
  },
];

export const AJUSTE_POR_CLAVE: ReadonlyMap<ClaveEditable, Ajuste> = new Map(
  AJUSTES.map((a) => [a.clave, a]),
);

export const CLAVES_EDITABLES: readonly ClaveEditable[] = AJUSTES.map((a) => a.clave);

/** `true` si ese rol puede cambiar ese ajuste. Una sola fuente para API y consola. */
export const puedeEditar = (rol: Rol, clave: ClaveEditable): boolean =>
  AJUSTE_POR_CLAVE.get(clave)?.editablePor.includes(rol) === true;

export interface Rechazo {
  readonly clave: string;
  readonly motivo: string;
}

/**
 * Valida un lote de cambios: función pura, sin base de datos y sin excepciones.
 *
 * Devuelve **todos** los rechazos, no el primero: quien corrige un formulario
 * necesita ver los cinco errores de una vez, no descubrirlos de uno en uno.
 */
export const validarCambios = (
  rol: Rol,
  cambios: Readonly<Record<string, unknown>>,
): readonly Rechazo[] => {
  const rechazos: Rechazo[] = [];
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined) continue;
    const ajuste = AJUSTE_POR_CLAVE.get(clave as ClaveEditable);
    if (ajuste === undefined) {
      rechazos.push({ clave, motivo: 'no es un ajuste editable desde la consola' });
      continue;
    }
    if (!ajuste.editablePor.includes(rol)) {
      rechazos.push({ clave, motivo: `tu rol no puede cambiar «${ajuste.etiqueta}»` });
      continue;
    }
    if (typeof valor !== 'string' && typeof valor !== 'number') {
      rechazos.push({ clave, motivo: 'se esperaba texto o número' });
      continue;
    }
    const motivo = ajuste.validar(valor);
    if (motivo !== null) rechazos.push({ clave, motivo });
  }
  return rechazos;
};

/**
 * Qué cambió de verdad, comparado con lo que hay guardado.
 *
 * Importa para la auditoría: un PATCH que reenvía el formulario entero sin
 * tocar nada **no** es un cambio de configuración, y anotarlo como tal llenaría
 * `auditoria_seguridad` de ruido justo en la tabla que se consulta durante un
 * incidente. Solo se escribe cuando hay diferencia.
 */
export const cambiosEfectivos = (
  actual: ConfiguracionDeCopropiedad,
  p: CambiosDeConfiguracion,
): CambiosDeConfiguracion => {
  const nombre = p.nombre === undefined ? undefined : sanearTexto(p.nombre);
  const zonaHoraria = p.zonaHoraria?.trim();
  const direccion = p.direccion === undefined ? undefined : sanearTexto(p.direccion);
  const etiquetaVivienda = p.etiquetaVivienda?.trim();
  const etiquetaAgrupacion = p.etiquetaAgrupacion?.trim();
  const codigo = p.codigoCorto === undefined ? undefined : codigoCortoEfectivo(p.codigoCorto);
  const telefono =
    p.telefonoPorteria === undefined || p.telefonoPorteria === null
      ? p.telefonoPorteria
      : telefonoEfectivo(p.telefonoPorteria);
  return {
    ...(nombre !== undefined && nombre !== actual.nombre ? { nombre } : {}),
    ...(zonaHoraria !== undefined && zonaHoraria !== actual.zonaHoraria ? { zonaHoraria } : {}),
    ...(direccion !== undefined && direccion !== actual.direccion ? { direccion } : {}),
    ...(p.tipo !== undefined && p.tipo !== actual.tipo ? { tipo: p.tipo } : {}),
    ...(etiquetaVivienda !== undefined && etiquetaVivienda !== actual.etiquetaVivienda
      ? { etiquetaVivienda }
      : {}),
    ...(etiquetaAgrupacion !== undefined && etiquetaAgrupacion !== actual.etiquetaAgrupacion
      ? { etiquetaAgrupacion }
      : {}),
    ...(p.politicaContingenciaEdge !== undefined &&
    p.politicaContingenciaEdge !== actual.politicaContingenciaEdge
      ? { politicaContingenciaEdge: p.politicaContingenciaEdge }
      : {}),
    ...(codigo !== undefined && codigo !== actual.codigoCorto ? { codigoCorto: codigo } : {}),
    ...(telefono !== undefined && telefono !== actual.telefonoPorteria
      ? { telefonoPorteria: telefono }
      : {}),
    ...(p.topeVehiculosPropios !== undefined &&
    p.topeVehiculosPropios !== actual.topeVehiculosPropios
      ? { topeVehiculosPropios: p.topeVehiculosPropios }
      : {}),
  };
};

/** Texto del registro de auditoría: qué ajuste, de qué valor a cuál. */
export const resumenDeCambios = (
  actual: ConfiguracionDeCopropiedad,
  efectivos: CambiosDeConfiguracion,
): string =>
  CLAVES_EDITABLES.filter((c) => efectivos[c] !== undefined)
    .map((c) => `${c}: ${String(actual[c])} → ${String(efectivos[c])}`)
    .join('; ');
