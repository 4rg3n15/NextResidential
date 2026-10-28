import type { MotivoAcceso } from '@ncr/contracts';
import { TEXTO_MOTIVO } from '@/lib/motivos';
import {
  ZONA_DE_LA_CONSOLA,
  finDelDiaEnZona,
  inicioDelDiaEnZona,
  instanteDeLocal,
} from '@/lib/hora-en-zona';

/**
 * D-145 · LOS FILTROS DEL BUSCADOR DE EVENTOS, SIN REACT
 *
 * Todo lo que decide qué se pide a la API vive aquí, en funciones puras: qué
 * dice la URL, qué rango toca a cada rol y qué viaja en la consulta. La
 * pantalla sólo pinta y guarda estado.
 *
 * **Limpiar es una VISTA** (RN-03, CA-23, ADR-05): el corte del portero no
 * borra ni marca nada en `eventos`; sólo adelanta el `desde` que se pide.
 */
export const METODOS = [
  { valor: 'placa', nombre: 'Placa' },
  { valor: 'facial', nombre: 'Rostro' },
  { valor: 'tarjeta', nombre: 'Tarjeta' },
  { valor: 'manual', nombre: 'A mano' },
  { valor: 'remoto', nombre: 'Remoto' },
] as const;
export type MetodoDeAcceso = (typeof METODOS)[number]['valor'];

export const nombreDeMetodo = (metodo: string | null): string =>
  METODOS.find((m) => m.valor === metodo)?.nombre ?? metodo ?? '—';

export interface FiltrosDeEventos {
  /** `YYYY-MM-DDTHH:MM` en hora de Bogotá; vacío = rango por omisión. */
  readonly desde: string;
  readonly hasta: string;
  readonly tipo: string;
  readonly dispositivoId: string;
  readonly viviendaId: string;
  readonly personaId: string;
  readonly zonaId: string;
  readonly resultado: '' | 'permitido' | 'negado';
  readonly motivo: '' | MotivoAcceso;
  /** Tal como se escribió: se normaliza al consultar. */
  readonly placa: string;
  readonly operadorId: string;
  readonly metodo: '' | MetodoDeAcceso;
  readonly identificacion: '' | 'conocida' | 'desconocida';
}

export const SIN_FILTROS: FiltrosDeEventos = {
  desde: '',
  hasta: '',
  tipo: '',
  dispositivoId: '',
  viviendaId: '',
  personaId: '',
  zonaId: '',
  resultado: '',
  motivo: '',
  placa: '',
  operadorId: '',
  metodo: '',
  identificacion: '',
};

const CLAVES = Object.keys(SIN_FILTROS) as (keyof FiltrosDeEventos)[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const uno = <T extends string>(valor: string, admitidos: readonly T[]): T | '' =>
  (admitidos as readonly string[]).includes(valor) ? (valor as T) : '';

/**
 * Lo que trae la URL, validado campo a campo: lo que no es lo que dice ser se
 * descarta en vez de mandarse a la API y volver con un 400 que tumba la vista.
 */
export const filtrosDeLaUrl = (consulta: string): FiltrosDeEventos => {
  const p = new URLSearchParams(consulta);
  const texto = (k: string): string => (p.get(k) ?? '').trim();
  const id = (k: string): string => (UUID.test(texto(k)) ? texto(k) : '');
  const hora = (k: string): string => (LOCAL.test(texto(k)) ? texto(k) : '');
  return {
    desde: hora('desde'),
    hasta: hora('hasta'),
    tipo: /^[a-z_]{1,48}$/.test(texto('tipo')) ? texto('tipo') : '',
    dispositivoId: id('dispositivoId'),
    viviendaId: id('viviendaId'),
    personaId: id('personaId'),
    zonaId: id('zonaId'),
    resultado: uno(texto('resultado'), ['permitido', 'negado'] as const),
    motivo: uno(texto('motivo'), Object.keys(TEXTO_MOTIVO) as MotivoAcceso[]),
    placa: texto('placa').slice(0, 16),
    operadorId: id('operadorId'),
    metodo: uno(
      texto('metodo'),
      METODOS.map((m) => m.valor),
    ),
    identificacion: uno(texto('identificacion'), ['conocida', 'desconocida'] as const),
  };
};

/** La URL de unos filtros: sólo lo que no está vacío, en orden estable. */
export const urlDeFiltros = (f: FiltrosDeEventos): string => {
  const p = new URLSearchParams();
  for (const k of CLAVES) if (f[k] !== '') p.set(k, f[k]);
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
};

export const hayFiltros = (f: FiltrosDeEventos): boolean => CLAVES.some((k) => f[k] !== '');

/**
 * La placa como la normaliza el objeto de valor `Placa` del dominio (NFKC,
 * mayúsculas, sin espacios, puntos, guiones ni guiones bajos, de 5 a 8). `null`
 * si aún no puede ser una placa: mientras se escribe no se pide nada.
 */
export const placaParaBuscar = (escrita: string): string | null => {
  const p = escrita
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s.\-_]/g, '');
  return /^[A-Z0-9]{5,8}$/.test(p) ? p : null;
};

export interface RangoDeLaVista {
  readonly desde: Date;
  readonly hasta: Date;
  /** Con fechas incompletas o al revés se enseña lo de por omisión, y se dice. */
  readonly ajustado: boolean;
  /**
   * `true` en la vista POR OMISIÓN del portero (sin filtros tocados): su día,
   * con el corte de medianoche y el de «Limpiar». Una búsqueda nunca lo es.
   */
  readonly delDia: boolean;
}

/**
 * El rango que se pide.
 *
 * · **Portero sin filtros**: su vista por omisión. Sólo HOY en Bogotá —el
 *   corte diario es automático— y, si pulsó «Limpiar» hoy, desde ese instante.
 * · **Portero que busca** (D-146, decisión del cliente del 27/10): en cuanto
 *   toca las fechas o cualquier filtro, lo mismo que la administración. El
 *   corte del día y el de «Limpiar» no recortan una búsqueda.
 * · **Resto** (administración, superadministración, central): lo que pidan,
 *   sin corte; por omisión los últimos 7 días.
 */
export const rangoDeLaVista = (
  f: FiltrosDeEventos,
  vista: { readonly delPortero: boolean; readonly limpiadoEn: Date | null },
  ahora: Date,
  zona: string = ZONA_DE_LA_CONSOLA,
): RangoDeLaVista => {
  const finDeHoy = finDelDiaEnZona(ahora, zona);
  const inicioDeHoy = inicioDelDiaEnZona(ahora, zona);
  if (vista.delPortero && !hayFiltros(f)) {
    const limpio = vista.limpiadoEn;
    const desde =
      limpio !== null && limpio > inicioDeHoy && limpio < finDeHoy ? limpio : inicioDeHoy;
    return { desde, hasta: finDeHoy, ajustado: false, delDia: true };
  }
  const porOmision = {
    desde: inicioDelDiaEnZona(new Date(ahora.getTime() - 7 * 86_400_000), zona),
    hasta: finDeHoy,
    delDia: false,
  };
  const desde = f.desde === '' ? porOmision.desde : instanteDeLocal(f.desde, zona);
  // `hasta` incluye el minuto escrito entero: el fin es exclusivo en el dominio.
  const hastaEscrito = f.hasta === '' ? null : instanteDeLocal(f.hasta, zona);
  const hasta =
    f.hasta === '' ? porOmision.hasta : hastaEscrito && new Date(hastaEscrito.getTime() + 60_000);
  if (desde === null || hasta === null || desde >= hasta) return { ...porOmision, ajustado: true };
  return { desde, hasta, ajustado: false, delDia: false };
};

/** Los filtros de ACCESO, comunes a la línea de tiempo y a la exportación. */
export const filtrosDeAcceso = (f: FiltrosDeEventos): Record<string, string> => {
  const placa = placaParaBuscar(f.placa);
  const pares: [string, string][] = [
    ['viviendaId', f.viviendaId],
    ['personaId', f.personaId],
    ['zonaId', f.zonaId],
    ['resultado', f.resultado],
    ['motivo', f.motivo],
    ['placa', placa ?? ''],
    ['operadorId', f.operadorId],
    ['metodo', f.metodo],
    ['identificacion', f.identificacion],
  ];
  return Object.fromEntries(pares.filter(([, v]) => v !== ''));
};

/**
 * La exportación (HU-32) con el MISMO rango y los mismos filtros de acceso que
 * la tabla: lo que se descarga es lo que se ve. El tipo no viaja: la línea de
 * tiempo y `/eventos` no comparten catálogo de tipos.
 */
export const urlDeExportacion = (
  copropiedadId: string,
  rango: Pick<RangoDeLaVista, 'desde' | 'hasta'>,
  f: FiltrosDeEventos,
  formato: 'csv' | 'excel' | 'pdf',
): string => {
  const p = new URLSearchParams({
    desde: rango.desde.toISOString(),
    hasta: rango.hasta.toISOString(),
    formato,
    ...(f.dispositivoId === '' ? {} : { dispositivoId: f.dispositivoId }),
    ...filtrosDeAcceso(f),
  });
  return `/api/ncr/copropiedades/${copropiedadId}/eventos/exportacion?${p.toString()}`;
};
