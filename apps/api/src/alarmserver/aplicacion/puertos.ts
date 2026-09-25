/**
 * Puertos del receptor de equipos, declarados por el CONSUMIDOR (§2.2).
 *
 * A2 (ETAPA 15-E) · la terminal reconoce un identificador de plantilla, no a
 * una persona. El ingestor necesita traducirlo para registrar el acceso a
 * nombre de alguien —`eventos.persona_id`— y no le importa quién lo haga: lo
 * satisface el módulo de biometría, y la raíz de composición los une.
 */
export interface ResolutorDeTitularBiometrico {
  /** La persona dueña de la plantilla, o `null` si Next Control no la gestiona. */
  titularDePlantilla(copropiedadId: string, plantillaId: string): Promise<string | null>;
}

// ── A4 (ETAPA 15-E) · la llamada del videoportero ────────────────────────────

/**
 * Lo que las consolas reciben cuando alguien llama desde un videoportero. No
 * es un acceso —no hay evento en `eventos`—: es un aviso EMERGENTE (RN-18,
 * KPI-25) con la vivienda resuelta cuando el equipo declara la unidad.
 */
export interface LlamadaEntrante {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly clase: 'llamada' | 'timbre';
  readonly viviendaId: string | null;
  /** El identificador legible de la vivienda («Casa 12»), o la unidad tal cual. */
  readonly vivienda: string | null;
  readonly origen: string | null;
  readonly ocurridoEn: Date;
  readonly referenciaExterna: string | null;
}

export interface AvisadorDeLlamadas {
  llamadaEntrante(llamada: LlamadaEntrante): Promise<void>;
}

/**
 * Quien traduce «edificio 2 · unidad 305» a una vivienda del padrón. Declarado
 * aquí por el CONSUMIDOR (§2.2); lo satisface el módulo de padrón por forma.
 * `[SUPUESTO]` S-42: la unidad es el identificador de la vivienda y el
 * edificio su agrupación.
 */
export interface ResolutorDeViviendaDeLlamada {
  porUnidad(
    copropiedadId: string,
    agrupacion: string | null,
    identificador: string,
  ): Promise<{ readonly id: string; readonly identificador: string } | null>;
}

/** Los equipos que EMITEN y hay que escuchar: terminales y videoporteros activos. */
export interface EquipoAEscuchar {
  readonly dispositivoId: string;
  readonly copropiedadId: string;
  readonly nombre: string;
}

export interface EquiposParaEscucha {
  activos(): Promise<readonly EquipoAEscuchar[]>;
}

export const AVISADOR_DE_LLAMADAS = Symbol.for('ncr.alarmserver.AvisadorDeLlamadas');
export const RESOLUTOR_DE_VIVIENDA_DE_LLAMADA = Symbol.for(
  'ncr.alarmserver.ResolutorDeViviendaDeLlamada',
);
