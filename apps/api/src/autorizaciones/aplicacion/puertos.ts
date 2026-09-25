import type {
  Autorizacion,
  ContextoDeAcceso,
  VersionDeReglas,
  ZonaSolicitada,
} from '@ncr/domain-core';

/**
 * Puertos del módulo de autorizaciones. La aplicación los DEFINE; la
 * infraestructura los cumple (§2.2, DIP).
 *
 * `CargadorDeContexto` es el puerto que hace posible que el motor sea puro:
 * todo el I/O ocurre aquí, antes de evaluar. El motor recibe el contexto ya
 * cerrado y no puede preguntar nada más.
 */
/**
 * Lo que una lectura trae para buscar autorizaciones — ETAPA 15-D, D-25.
 *
 * Una lectura de placa no viene con persona; una facial no viene con placa. El
 * repositorio devuelve, en UNA consulta, las autorizaciones activas que casan
 * con cualquiera de las dos, y el motor decide con todas delante.
 */
export interface CriterioDeLectura {
  readonly placa: string | null;
  readonly personaId: string | null;
}

export interface RepositorioAutorizaciones {
  guardar(copropiedadId: string, autorizacion: Autorizacion, actorId: string): Promise<void>;
  porId(copropiedadId: string, autorizacionId: string): Promise<Autorizacion | null>;
  vigentesDePersona(copropiedadId: string, personaId: string): Promise<readonly Autorizacion[]>;
  /**
   * Activas (no revocadas) que casan con la lectura, rehidratadas ENTERAS en
   * una sola consulta: acompañantes, zonas y patrón incluidos. Sin N+1: es la
   * consulta que el motor paga por cada evento, y una por política sería
   * exactamente el defecto que §2.4 prohíbe.
   *
   * Las vencidas TAMBIÉN vuelven: distinguir «no hay autorización» de «la
   * hubo y venció» es lo que separa PLACA_DESCONOCIDA de VIGENCIA_EXPIRADA.
   */
  activasParaLectura(
    copropiedadId: string,
    criterio: CriterioDeLectura,
  ): Promise<readonly Autorizacion[]>;
  /**
   * ETAPA 15-D (O3) · enlaza la fotografía de IDENTIFICACIÓN del visitante.
   * Recibe la referencia al objeto ya guardado en el bucket privado —nunca los
   * bytes— y devuelve `false` si la autorización no existe en esa copropiedad.
   */
  adjuntarFotografia(
    copropiedadId: string,
    autorizacionId: string,
    fotografia: FotografiaDeVisitante,
    actorId: string,
  ): Promise<boolean>;
  /** La referencia al objeto, para firmar una URL de vida corta. Nunca una URL. */
  fotografiaDe(
    copropiedadId: string,
    autorizacionId: string,
  ): Promise<Pick<FotografiaDeVisitante, 'clave' | 'tipoMime'> | null>;
}

/**
 * Referencia a la fotografía del visitante en el almacén de evidencia (RN-21).
 *
 * NO es un dato biométrico: no se genera plantilla, no viaja a ninguna terminal
 * y no la compara ningún algoritmo; la mira el portero para confrontar. Es la
 * decisión documentada en el ADR-021, y por eso vive en `evidencias` con tipo
 * `foto_visitante` y no en `plantillas_biometricas`.
 */
export interface FotografiaDeVisitante {
  /** Clave del objeto en el bucket (`visitantes/<cop>/<autorización>/<id>.jpg`). */
  readonly clave: string;
  readonly tipoMime: string;
  readonly hashSha256: string;
  readonly tamanoBytes: number;
}

/**
 * El adaptador la lanza cuando la vivienda destino no tiene residente titular
 * activo: la base exige que `autorizado_por` sea uno (RN-05, disparador
 * `tg_autorizacion_coherente`), y desde la consola quien crea es un
 * administrador o un portero que autoriza EN NOMBRE de la vivienda
 * ([SUPUESTO] S-38). La aplicación la traduce a un error tipado.
 */
export class ViviendaSinTitular extends Error {
  constructor(readonly viviendaId: string) {
    super('La vivienda no tiene un residente titular activo que pueda autorizar (RN-05)');
    this.name = 'ViviendaSinTitular';
  }
}

/**
 * **Modelo de LECTURA de la pantalla de visitantes.** Es un puerto aparte del
 * repositorio del agregado, y esa separación es deliberada: lo que la pantalla
 * necesita —el nombre del visitante, el identificador de la vivienda, los
 * acompañantes por nombre— no son datos del agregado sino de tres tablas
 * vecinas. Meterlos en `RepositorioAutorizaciones` obligaría al agregado a
 * cargar con información que no usa para decidir nada.
 */
export interface PatronExpuesto {
  /** Días 0..6 con domingo = 0, el vocabulario del dominio. */
  readonly dias: readonly number[];
  readonly horaInicio: string;
  readonly horaFin: string;
}

export interface AutorizacionEnLista {
  readonly id: string;
  readonly viviendaId: string;
  readonly vivienda: string;
  readonly visitante: string;
  readonly documento: string;
  readonly desde: string;
  readonly hasta: string;
  readonly tipo: 'unica' | 'recurrente';
  readonly estado: 'activa' | 'revocada';
  readonly placa: string | null;
  readonly acompanantes: readonly string[];
  readonly patron: PatronExpuesto | null;
  readonly revocadaEn: string | null;
  readonly motivoRevocacion: string | null;
  /** ETAPA 15-D (O3) · observaciones del residente y si hay fotografía adjunta. */
  readonly observaciones: string | null;
  readonly tieneFotografia: boolean;
}

export interface RepositorioDeConsultaDeAutorizaciones {
  listar(
    copropiedadId: string,
    solo: 'activas' | 'historial',
  ): Promise<readonly AutorizacionEnLista[]>;
}

export const CONSULTA_AUTORIZACIONES = Symbol.for('ncr.puerto.ConsultaDeAutorizaciones');

export interface EntradaListaNegra {
  readonly id: string;
  readonly copropiedadId: string;
  readonly personaId: string | null;
  readonly placa: string | null;
  readonly motivo: string;
  readonly creadaPor: string;
  readonly levantadaPor: string | null;
  readonly levantadaEn: Date | null;
}

export interface RepositorioListaNegra {
  crear(entrada: Omit<EntradaListaNegra, 'levantadaPor' | 'levantadaEn'>): Promise<void>;
  porId(copropiedadId: string, id: string): Promise<EntradaListaNegra | null>;
  levantar(copropiedadId: string, id: string, actorId: string, ahora: Date): Promise<boolean>;
  activasDe(copropiedadId: string): Promise<readonly EntradaListaNegra[]>;
}

export interface RepositorioVersionDeReglas {
  vigenteDe(copropiedadId: string): Promise<VersionDeReglas>;
}

/** Datos de la solicitud tal como llegan del punto de acceso, ya normalizados. */
export interface SolicitudDeAcceso {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly metodo: ContextoDeAcceso['metodo'];
  readonly personaId: string | null;
  readonly placaLeida: string | null;
  readonly zonaId: string | null;
  readonly confianza: number;
}

/**
 * Reúne, con I/O, todo lo que el motor necesita. Existe como puerto propio y no
 * como método de un repositorio porque cruza varios agregados —autorizaciones,
 * lista negra, zona, consentimiento— y ninguno es su dueño.
 */
export interface CargadorDeContexto {
  cargar(solicitud: SolicitudDeAcceso, ahora: Date): Promise<ContextoDeAcceso>;
}

/**
 * Resuelve la zona que el motor necesita en el contexto — CU-05, ETAPA 07.
 *
 * Lo declara el CONSUMIDOR: el cargador de contexto necesita saber si la zona
 * abre y si está llena, y no le importa quién se lo diga. El módulo de zonas lo
 * satisface desde su repositorio, y la raíz de composición los une. Así el
 * módulo de autorizaciones no aparece en ningún `import` del de zonas ni al
 * revés (§2.2).
 */
export interface ResolutorDeZona {
  resolver(copropiedadId: string, zonaId: string, ahora: Date): Promise<ZonaSolicitada | null>;
}

export const RESOLUTOR_DE_ZONA = Symbol.for('ncr.puerto.ResolutorDeZona');

/**
 * Lo que el motor necesita saber del PADRÓN por una placa — ETAPA 15-D, D-25.
 *
 * Mismo patrón que `ResolutorDeZona`: lo declara el consumidor, lo satisface el
 * módulo de padrón desde su repositorio, y ninguno de los dos importa código
 * interno del otro ni consulta sus tablas (§2.2). El cargador de contexto no
 * sabe que existe `vehiculos`; sabe que alguien resuelve placas.
 */
export interface PlacaResuelta {
  readonly vehiculoId: string;
  readonly viviendaId: string;
  readonly viviendaActiva: boolean;
  /** Cuándo dejó de regir el derecho del residente, si la vivienda se dio de baja. */
  readonly viviendaDesactivadaEn: Date | null;
  readonly personaId: string | null;
  readonly registradoEn: Date;
}

export interface ResolutorDePlaca {
  resolver(copropiedadId: string, placa: string): Promise<PlacaResuelta | null>;
}

export const RESOLUTOR_DE_PLACA = Symbol.for('ncr.puerto.ResolutorDePlaca');

/**
 * El umbral de confianza VIGENTE de una copropiedad (P-02, resuelta en 80/100).
 *
 * Declarado aquí y satisfecho por quien guarda la configuración: el cargador
 * necesita el número y no la tabla. Devuelve `null` cuando la copropiedad no
 * existe, y quien llama aplica el valor por omisión del contrato.
 */
export interface LectorDeUmbralDeConfianza {
  umbralDeConfianzaPlaca(copropiedadId: string): Promise<number | null>;
}

export const LECTOR_DE_UMBRAL = Symbol.for('ncr.puerto.LectorDeUmbralDeConfianza');

export const REPOSITORIO_AUTORIZACIONES = Symbol.for('ncr.puerto.RepositorioAutorizaciones');
export const REPOSITORIO_LISTA_NEGRA = Symbol.for('ncr.puerto.RepositorioListaNegra');
export const REPOSITORIO_VERSION_REGLAS = Symbol.for('ncr.puerto.RepositorioVersionDeReglas');
export const CARGADOR_DE_CONTEXTO = Symbol.for('ncr.puerto.CargadorDeContexto');
