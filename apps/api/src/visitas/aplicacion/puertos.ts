/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PUERTOS DEL MÓDULO DE VISITAS · ETAPA 15-L (F)
 *
 * «Generar autorización» es UNA operación para quien la hace —nombre,
 * documento, cuándo, cuánto, qué vivienda, foto y casilla— y cuatro para el
 * sistema: la persona, la autorización, la foto con su plantilla y la
 * sincronización con los equipos. Este módulo las ORQUESTA; no reimplementa
 * ninguna: la autorización es de `autorizaciones`, la plantilla y su
 * consentimiento son de `biometria`, el aviso en vivo es de `eventos`.
 *
 * Lo que sí es suyo: resolver a la persona por su documento, dejar la
 * constancia de la casilla en la autorización (ADR-032) y la lectura de las
 * visitas tal como se enseñan —del día para portería, por vivienda con filtros
 * para administración, las últimas para el residente—.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const PERSONAS_DE_VISITA = Symbol.for('ncr.puerto.PersonasDeVisita');
export const CONSTANCIA_DE_CASILLA = Symbol.for('ncr.puerto.ConstanciaDeCasilla');
export const CONSULTA_DE_VISITAS = Symbol.for('ncr.puerto.ConsultaDeVisitas');
export const LECTOR_DE_FOTOS_DE_VISITA = Symbol.for('ncr.puerto.LectorDeFotosDeVisita');

/** El tema del canal en vivo por el que viajan las visitas nuevas y anuladas. */
export const TEMA_VISITAS = 'visitas';

export const TIPOS_DE_DOCUMENTO = ['cedula', 'cedula_extranjeria', 'pasaporte', 'otro'] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

export interface DatosDeVisitante {
  readonly nombre: string;
  readonly tipoDocumento: TipoDeDocumento;
  readonly documento: string;
}

/**
 * La persona del visitante, por su documento: la que ya existe en la
 * copropiedad o una nueva. El documento se normaliza en la base con la misma
 * función que usa el resto del padrón.
 */
export interface PersonasDeVisita {
  resolver(copropiedadId: string, visitante: DatosDeVisitante, actorId: string): Promise<string>;
}

/** La casilla de ESTA autorización: quién, cuándo y sobre qué versión del texto. */
export interface Casilla {
  readonly declaradoPor: string;
  readonly en: Date;
  readonly version: string;
}

export interface ConstanciaDeCasilla {
  anotar(copropiedadId: string, autorizacionId: string, casilla: Casilla): Promise<void>;
}

export const ESTADOS_DE_VISITA = ['programada', 'vigente', 'vencida', 'anulada'] as const;
export type EstadoDeVisita = (typeof ESTADOS_DE_VISITA)[number];

export interface FiltroDeVisitas {
  /** Visitas cuya franja toca [desde, hasta). */
  readonly desde: Date | null;
  readonly hasta: Date | null;
  readonly viviendaId: string | null;
  readonly estado: EstadoDeVisita | null;
  /** Nombre o documento del visitante. */
  readonly texto: string | null;
  readonly ahora: Date;
  readonly limite: number;
}

export interface VisitaListada {
  readonly autorizacionId: string;
  readonly visitante: string;
  readonly documento: string;
  readonly viviendaId: string;
  readonly vivienda: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly estado: EstadoDeVisita;
  readonly placa: string | null;
  readonly generadaPor: string | null;
  readonly generadaEn: Date;
  readonly anuladaEn: Date | null;
  readonly motivoAnulacion: string | null;
  readonly tieneFoto: boolean;
  readonly casillaDeclaradaPor: string | null;
  readonly casillaEn: Date | null;
  readonly plantillaId: string | null;
  /** Para la confirmación OPCIONAL del titular presente (D-10). */
  readonly consentimientoId: string | null;
  /** `true` si el titular ya confirmó en persona la casilla declarada. */
  readonly confirmadoPorElTitular: boolean;
  readonly equiposSincronizados: number;
  readonly equiposFallidos: number;
}

export const ESTADOS_EN_EQUIPO = ['pendiente', 'sincronizada', 'fallida', 'suprimida'] as const;
export type EstadoEnEquipo = (typeof ESTADOS_EN_EQUIPO)[number];

export interface FotoEnEquipo {
  readonly dispositivoId: string;
  readonly equipo: string;
  readonly estado: EstadoEnEquipo;
  readonly detalle: string | null;
  readonly intentos: number;
  readonly actualizadoEn: Date;
}

export interface ViviendaDeVisita {
  readonly id: string;
  readonly nombre: string;
}

export interface VisitanteReciente {
  /** La última autorización de esta persona para esta vivienda. */
  readonly autorizacionId: string;
  readonly visitante: string;
  readonly documento: string;
  readonly ultimaVisita: Date;
  readonly placa: string | null;
  readonly tieneFoto: boolean;
}

export interface DatosParaRepetir {
  readonly visitante: string;
  readonly documento: string;
  readonly placa: string | null;
  /** La calidad medida cuando se tomó la foto; `null` si nunca tuvo plantilla. */
  readonly calidad: number | null;
}

export interface ConsultaDeVisitas {
  listar(copropiedadId: string, filtro: FiltroDeVisitas): Promise<readonly VisitaListada[]>;
  porId(copropiedadId: string, autorizacionId: string, ahora: Date): Promise<VisitaListada | null>;
  /** El día de hoy EN LA ZONA HORARIA DE LA COPROPIEDAD, como [inicio, fin). */
  diaDe(
    copropiedadId: string,
    ahora: Date,
  ): Promise<{ readonly desde: Date; readonly hasta: Date }>;
  fotoEnEquipos(copropiedadId: string, autorizacionId: string): Promise<readonly FotoEnEquipo[]>;
  viviendas(copropiedadId: string): Promise<readonly ViviendaDeVisita[]>;
  /** Una por persona, la más reciente primero. SOLO de esa vivienda. */
  ultimosDeVivienda(
    copropiedadId: string,
    viviendaId: string,
    limite: number,
  ): Promise<readonly VisitanteReciente[]>;
  /** Lo que se copia al volver a autorizar. `null` si no es de esa vivienda. */
  paraRepetir(
    copropiedadId: string,
    viviendaId: string,
    autorizacionId: string,
  ): Promise<DatosParaRepetir | null>;
}

/**
 * Los bytes de una foto ya guardada, para «Volver a autorizar» (F6). Lo
 * satisface el almacén de evidencia; la foto no sale al cliente por aquí: se
 * lee para volver a registrarla en la nueva autorización.
 */
export interface LectorDeFotosDeVisita {
  leer(clave: string): Promise<Uint8Array | null>;
}
