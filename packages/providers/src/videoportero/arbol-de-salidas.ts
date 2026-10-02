import type { EstadoDeNodo, NodoDeSalidas } from '../nucleo/salidas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · EL ÁRBOL DE SALIDAS, LEÍDO DE LO QUE EL VIDEOPORTERO DECLARA
 *
 * Funciones puras sobre los documentos que el equipo devuelve; quien los pide
 * es `salidas-del-equipo.ts`. El manual es de FAMILIA (ISAPI IP Series /
 * Ultra Series): ninguna capacidad se supone por modelo.
 *
 *  · número de puertas: `<doorNo min max>` de las órdenes remotas admitidas;
 *  · nombres: con la apertura de cerraduras declarada (`OpenDoorParams`,
 *    «cerradura 1, cerradura 2, ambas») y hasta dos puertas, «Cerradura N»
 *    ([SUPUESTO] S-179: la cerradura N es la puerta N);
 *  · unidad de puerta segura (RS-485): su estado —en línea, manipulada—. La
 *    cerradura que gobierna se abre por su número de puerta del equipo: la
 *    unidad la protege, no añade otra;
 *  · submódulos (teclado, lector, placa de nombres): periféricos, sin salida;
 *  · ascensor: declarado, y fuera de la consola (PENDIENTE DE DEFINICIÓN).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface DocumentosDeSalidas {
  readonly capacidades: string | null;
  readonly ordenRemota: string | null;
  readonly unidadesSeguras: string | null;
  readonly submodulos: string | null;
}

/** Más puertas que esto en un videoportero es un documento mal leído. */
export const PUERTAS_MAXIMAS = 16;

const bandera = (doc: string | null, nombre: string): boolean =>
  doc !== null &&
  (new RegExp(`<${nombre}>\\s*true\\s*</${nombre}>`, 'i').test(doc) ||
    new RegExp(`"${nombre}"\\s*:\\s*true`, 'i').test(doc));

export const leerBanderas = (capacidades: string | null) => ({
  aperturaDeCerraduras: bandera(capacidades, 'isSupportOpenDoorParams'),
  unidadSegura:
    bandera(capacidades, 'isSupportDoorSecurityModulePairParams') ||
    bandera(capacidades, 'isSupportDoorSecurityModuleSwitchParams'),
  estadoDeUnidades: bandera(capacidades, 'isSupportModuleStatus'),
  submodulos: bandera(capacidades, 'isSupportSubModules'),
  ascensor: bandera(capacidades, 'isSupportElevatorControlCfg'),
});

const atributo = (etiqueta: string, nombre: string): number | null => {
  const valor = new RegExp(`\\b${nombre}="(\\d+)"`, 'i').exec(etiqueta)?.[1];
  return valor === undefined ? null : Number(valor);
};

/** `<doorNo min="1" max="N">` → el intervalo, acotado a `PUERTAS_MAXIMAS`. */
export const leerPuertas = (
  doc: string | null,
): { readonly desde: number; readonly hasta: number } | null => {
  const etiqueta = doc === null ? undefined : /<doorNo\b[^>]*>/i.exec(doc)?.[0];
  if (etiqueta === undefined) return null;
  const desde = atributo(etiqueta, 'min') ?? 1;
  const hasta = atributo(etiqueta, 'max');
  if (hasta === null || hasta < desde || desde < 1) return null;
  return { desde, hasta: Math.min(hasta, desde + PUERTAS_MAXIMAS - 1) };
};

/** `<cmd opt="open,close,…">` → las órdenes que el equipo admite. */
export const leerOrdenes = (doc: string | null): readonly string[] =>
  (doc === null ? undefined : /<cmd\b[^>]*\bopt="([^"]*)"/i.exec(doc)?.[1])
    ?.split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '') ?? [];

const texto = (bloque: string, nombre: string): string | null =>
  new RegExp(`<${nombre}\\b[^>]*>\\s*([^<]*?)\\s*</${nombre}>`, 'i').exec(bloque)?.[1] ?? null;

export const leerUnidadesSeguras = (doc: string | null) =>
  (doc ?? '')
    .split(/<ModuleStatus\b/i)
    .slice(1)
    .map((bloque) => ({
      numero: texto(bloque, 'securityModuleNo') ?? '?',
      enLinea:
        texto(bloque, 'onlineStatus') === null ? null : texto(bloque, 'onlineStatus') === '1',
      manipulada: texto(bloque, 'desmantelStatus') === '1',
    }));

const NOMBRES_DE_SUBMODULO: readonly (readonly [RegExp, string])[] = [
  [/-KK$/, 'Placa de nombres'],
  [/-KP$/, 'Teclado'],
  [/-(M|E)$|^DS-110\d/, 'Lector de tarjetas'],
  [/-SG$/, 'Módulo indicador'],
  [/-DIS$/, 'Pantalla'],
  [/-PMR$/, 'Módulo de radio'],
];

const ESTADO_DE_SUBMODULO: Readonly<Record<string, EstadoDeNodo>> = {
  online: 'en_linea',
  offline: 'fuera_de_linea',
  fault: 'averiada',
};

/** `{ "SubModules": [ { id, moduleType, status } ] }`, o anidado un nivel más. */
export const leerSubmodulos = (doc: string | null) => {
  let crudo: unknown;
  try {
    crudo = doc === null ? null : JSON.parse(doc);
  } catch {
    return [];
  }
  const raiz = (crudo as { SubModules?: unknown } | null)?.SubModules;
  const lista = Array.isArray(raiz)
    ? raiz
    : (Object.values((raiz ?? {}) as Record<string, unknown>).find(Array.isArray) ?? []);
  return (lista as { id?: unknown; moduleType?: unknown; status?: unknown }[])
    .filter((m) => typeof m.id === 'number' || typeof m.id === 'string')
    .map((m) => {
      const tipo = typeof m.moduleType === 'string' ? m.moduleType.trim() : '';
      const nombre = NOMBRES_DE_SUBMODULO.find(([patron]) => patron.test(tipo))?.[1] ?? 'Submódulo';
      return {
        id: String(m.id),
        nombre,
        estado: ESTADO_DE_SUBMODULO[String(m.status ?? '').trim()] ?? null,
      };
    });
};

const salida = (numero: number, nombre: string): NodoDeSalidas => ({
  clave: `puerta-${String(numero)}`,
  tipo: 'salida',
  nombre,
  numeroDePuerta: numero,
  estado: null,
  nota: null,
  hijos: [],
});

const modulo = (
  clave: string,
  nombre: string,
  extra: Partial<NodoDeSalidas> = {},
): NodoDeSalidas => ({
  clave,
  tipo: 'modulo',
  nombre,
  numeroDePuerta: null,
  estado: null,
  nota: null,
  hijos: [],
  ...extra,
});

/** Las salidas propias: las que el equipo dice, o la de la ficha si no dice nada. */
const salidasPropias = (
  docs: DocumentosDeSalidas,
  puertaDeLaFicha: number | null,
): NodoDeSalidas => {
  const banderas = leerBanderas(docs.capacidades);
  const ordenes = leerOrdenes(docs.ordenRemota);
  const puertas = leerPuertas(docs.ordenRemota);
  if (puertas === null) {
    return puertaDeLaFicha === null
      ? modulo('propio', 'Salidas del equipo', {
          nota: 'El equipo no declara puertas que abrir a distancia',
        })
      : modulo('propio', 'Salidas del equipo', {
          nota: 'El equipo no dice cuántas puertas tiene: se usa la de su ficha',
          hijos: [salida(puertaDeLaFicha, `Puerta ${String(puertaDeLaFicha)}`)],
        });
  }
  if (ordenes.length > 0 && !ordenes.includes('open')) {
    return modulo('propio', 'Salidas del equipo', {
      nota: 'El equipo no admite la orden de abrir a distancia',
    });
  }
  const cerraduras = banderas.aperturaDeCerraduras && puertas.hasta - puertas.desde < 2;
  const hijos = Array.from({ length: puertas.hasta - puertas.desde + 1 }, (_, i) => {
    const n = puertas.desde + i;
    return salida(n, `${cerraduras ? 'Cerradura' : 'Puerta'} ${String(n)}`);
  });
  const fija = ordenes.includes('alwaysOpen') || ordenes.includes('alwaysClose');
  return modulo('propio', 'Salidas del equipo', {
    hijos,
    nota: fija
      ? 'El equipo admite dejar la puerta libre o bloqueada; la consola sólo abre ' +
        '(PENDIENTE DE DEFINICIÓN: quién puede dejarla así)'
      : null,
  });
};

export const construirArbolDeSalidas = (
  nombreDelEquipo: string,
  docs: DocumentosDeSalidas,
  puertaDeLaFicha: number | null,
): NodoDeSalidas => {
  const banderas = leerBanderas(docs.capacidades);
  const unidades = leerUnidadesSeguras(docs.unidadesSeguras).map((u) =>
    modulo(`unidad-segura-${u.numero}`, `Unidad de puerta segura ${u.numero}`, {
      estado: u.manipulada
        ? 'manipulada'
        : u.enLinea === null
          ? null
          : u.enLinea
            ? 'en_linea'
            : 'fuera_de_linea',
      nota: 'Protege una cerradura del equipo: se abre por su número de puerta',
    }),
  );
  const unidadSinEstado =
    banderas.unidadSegura && unidades.length === 0
      ? [
          modulo('unidad-segura', 'Unidad de puerta segura', {
            nota: 'Declarada; el equipo no informó su estado',
          }),
        ]
      : [];
  const submodulos = leerSubmodulos(docs.submodulos).map((s) =>
    modulo(`submodulo-${s.id}`, s.nombre, {
      estado: s.estado,
      nota: 'Periférico sin salida propia',
    }),
  );
  const ascensor = banderas.ascensor
    ? [
        modulo('ascensor', 'Control de ascensor', {
          nota: 'PENDIENTE DE DEFINICIÓN: llamar el ascensor no es abrir una puerta; no se opera desde la consola',
        }),
      ]
    : [];
  return {
    clave: 'equipo',
    tipo: 'equipo',
    nombre: nombreDelEquipo,
    numeroDePuerta: null,
    estado: null,
    nota: null,
    hijos: [
      salidasPropias(docs, puertaDeLaFicha),
      ...unidades,
      ...unidadSinEstado,
      ...submodulos,
      ...ascensor,
    ],
  };
};
