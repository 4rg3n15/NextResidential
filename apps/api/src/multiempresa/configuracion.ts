import type { Rol } from '../autenticacion';

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
  | 'zonaHoraria'
  | 'umbralConfianzaPlaca'
  | 'politicaContingenciaEdge'
  | 'umbralLatidoMinutos';

export type PoliticaContingencia = 'denegar' | 'escalar_portero';

/** Lo que la consola pinta: lo editable y lo que solo se consulta. */
export interface ConfiguracionDeCopropiedad {
  readonly nombre: string;
  readonly zonaHoraria: string;
  readonly umbralConfianzaPlaca: number;
  readonly politicaContingenciaEdge: PoliticaContingencia;
  readonly umbralLatidoMinutos: number;
  /* ── Solo lectura ── */
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
  readonly zonaHoraria?: string;
  readonly umbralConfianzaPlaca?: number;
  readonly politicaContingenciaEdge?: PoliticaContingencia;
  readonly umbralLatidoMinutos?: number;
}

interface Ajuste {
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
    clave: 'umbralConfianzaPlaca',
    /**
     * Solo el superadministrador. No es una preferencia: por debajo de este
     * número la lectura de placa NO decide sola y escala al portero (CU-01,
     * excepción 3a). Bajarlo convierte lecturas dudosas en aperturas
     * automáticas, y eso no es una decisión de un administrador de conjunto.
     */
    etiqueta: 'Umbral de confianza de placa',
    editablePor: ['superadministrador'],
    validar: (valor) => {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) return 'se esperaba un número';
      if (valor < 0.5 || valor > 1) return 'debe estar entre 0,500 y 1,000';
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
  {
    clave: 'umbralLatidoMinutos',
    etiqueta: 'Margen de latido de dispositivo',
    editablePor: ['superadministrador', 'administrador'],
    validar: (valor) => {
      if (typeof valor !== 'number' || !Number.isInteger(valor)) return 'se esperaba un entero';
      if (valor < 1 || valor > 60) return 'debe estar entre 1 y 60 minutos';
      return null;
    },
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
  const nombre = p.nombre?.trim();
  const zonaHoraria = p.zonaHoraria?.trim();
  return {
    ...(nombre !== undefined && nombre !== actual.nombre ? { nombre } : {}),
    ...(zonaHoraria !== undefined && zonaHoraria !== actual.zonaHoraria ? { zonaHoraria } : {}),
    ...(p.umbralConfianzaPlaca !== undefined &&
    p.umbralConfianzaPlaca !== actual.umbralConfianzaPlaca
      ? { umbralConfianzaPlaca: p.umbralConfianzaPlaca }
      : {}),
    ...(p.politicaContingenciaEdge !== undefined &&
    p.politicaContingenciaEdge !== actual.politicaContingenciaEdge
      ? { politicaContingenciaEdge: p.politicaContingenciaEdge }
      : {}),
    ...(p.umbralLatidoMinutos !== undefined && p.umbralLatidoMinutos !== actual.umbralLatidoMinutos
      ? { umbralLatidoMinutos: p.umbralLatidoMinutos }
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
