/**
 * LAS CINCO LATENCIAS COMPROMETIDAS, Y QUÉ TRAMO MIDE CADA UNA.
 *
 * El alcance de la ETAPA 14 es explícito: «el documento exige poder
 * DEMOSTRARLAS, no afirmarlas». Demostrar una latencia obliga a decir tres
 * cosas que una cifra suelta no dice: **dónde empieza el cronómetro, dónde
 * termina, y qué queda fuera**. Sin eso, un p95 de 40 ms sobre el tramo
 * equivocado es una afirmación más cómoda y no más cierta.
 *
 * Por eso cada entrada lleva `segmento` y `noIncluye`, y `noIncluye` no es
 * cortesía: es lo que impide que un tablero verde se lea como un KPI cumplido
 * cuando el tramo que falta es justo el que puede incumplirlo. El tramo físico
 * —cámara, relé, terminal— lo mide la ETAPA 15 contra el equipo real, y hasta
 * entonces nadie puede afirmarlo desde aquí.
 *
 * Fuente de los umbrales: `docs/auditoria/04-requisitos-no-funcionales.md`
 * §01.1 a §01.4 y §12.1, que a su vez los deriva de los KPI del documento de
 * requisitos.
 */
export const CLAVES_KPI = ['KPI-09', 'KPI-13', 'KPI-25', 'KPI-32', 'KPI-33'] as const;

export type ClaveKpi = (typeof CLAVES_KPI)[number];

export interface DefinicionKpi {
  /** Identificador del indicador en el documento de requisitos. */
  readonly clave: ClaveKpi;
  readonly titulo: string;
  /** Techo comprometido, en milisegundos. Una muestra por encima es un incumplimiento. */
  readonly umbralMs: number;
  /** Dónde arranca y dónde para el cronómetro. */
  readonly segmento: string;
  /** Lo que este número NO contiene. Se lee antes que el número. */
  readonly noIncluye: string;
  /** Requisito no funcional y criterio de aceptación asociados. */
  readonly rnf: string;
  readonly ca?: string;
}

export const KPIS: Readonly<Record<ClaveKpi, DefinicionKpi>> = {
  'KPI-09': {
    clave: 'KPI-09',
    titulo: 'Autorización creada → disponible en el motor de reglas',
    umbralMs: 5_000,
    segmento:
      'desde que entra el POST de creación hasta que la respuesta sale: cuando sale, la ' +
      'autorización está confirmada en PostgreSQL y el motor ya la lee',
    noIncluye: 'el tramo del teléfono del residente hasta la API (red móvil)',
    rnf: 'RNF-01.2',
    ca: 'CA-04',
  },
  'KPI-13': {
    clave: 'KPI-13',
    titulo: 'Detección de placa → accionamiento del relé',
    umbralMs: 3_000,
    segmento:
      'desde que entra el POST del Alarm Server hasta que la API termina de decidir, ' +
      'registrar el evento y emitir la orden de apertura',
    noIncluye:
      'LOS DOS EXTREMOS FÍSICOS, y hay que leerlo antes que la cifra: ni el tiempo que ' +
      'la cámara tarda en reconocer la placa y emitir el POST, ni el que el relé tarda ' +
      'en cerrar. El contrato de ingesta en vivo NO trae marca del equipo —solo la trae ' +
      'la reconciliación del Edge, que es otro caso—, así que desde aquí no hay forma de ' +
      'medir el primer tramo. Se cierra en la ETAPA 15, que tiene el equipo delante y ' +
      'puede llevar la marca del dispositivo al contrato (deuda D-120)',
    rnf: 'RNF-01.1',
    ca: 'CA-12',
  },
  'KPI-25': {
    clave: 'KPI-25',
    titulo: 'Evento crítico → notificación al operador de central',
    umbralMs: 10_000,
    segmento:
      'desde `alerta.generadaEn` hasta que el canal de tiempo real confirma entrega. Lo ' +
      'calcula `EscalarAlerta`, que ya lo necesitaba para decidir si escaló dentro de plazo',
    noIncluye: 'el tramo del navegador del operador hasta su pantalla',
    rnf: 'RNF-12.1',
    ca: 'CA-18',
  },
  'KPI-32': {
    clave: 'KPI-32',
    titulo: 'Acción del operador → accionamiento remoto',
    umbralMs: 3_000,
    segmento: 'la orden manual completa: validación de motivo, decisión, evento y accionador',
    noIncluye: 'el tramo físico del equipo, igual que KPI-13',
    rnf: 'RNF-01.3',
    ca: 'CA-20',
  },
  'KPI-33': {
    clave: 'KPI-33',
    titulo: 'Establecimiento de audio y vídeo, extremo a extremo',
    umbralMs: 2_000,
    segmento: 'la apertura del canal de intercom: desde la petición hasta el canal disponible',
    noIncluye:
      'hoy mide el canal SIMULADO (ADR-03): el adaptador real llega en la ETAPA 15 y el ' +
      'tablero lo dice en cada fila para que nadie lea esta cifra como si fuera el equipo',
    rnf: 'RNF-01.4',
    ca: 'CA-19',
  },
};

export const esClaveKpi = (v: unknown): v is ClaveKpi =>
  typeof v === 'string' && (CLAVES_KPI as readonly string[]).includes(v);
