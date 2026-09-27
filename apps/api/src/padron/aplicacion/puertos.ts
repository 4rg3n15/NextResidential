import type { Documento, Placa, TipoDeDocumento, ViviendaProyectada } from '@ncr/domain-core';

/**
 * Puertos del padrón. La aplicación los define; la infraestructura los cumple.
 *
 * `registrarVehiculo` devuelve un discriminador en vez de lanzar: el choque de
 * placa activa NO es un error técnico sino una decisión de negocio esperada
 * (RN-04), y quien la provoca es el índice único de la base. Convertirlo en
 * excepción obligaría al caso de uso a inspeccionar códigos de error de
 * PostgreSQL, que es exactamente el detalle de infraestructura que el puerto
 * existe para ocultar.
 */
export type ResultadoRegistroVehiculo =
  | { readonly tipo: 'registrado'; readonly id: string }
  | { readonly tipo: 'placa_activa_duplicada' };

/** Catálogo cerrado, el mismo de la migración `0027`. */
export type TipoDeVehiculo = 'automovil' | 'motocicleta' | 'bicicleta' | 'otro';

export interface AltaVehiculo {
  readonly copropiedadId: string;
  readonly viviendaId: string;
  readonly personaId: string | null;
  readonly placa: Placa;
  readonly marca?: string | null;
  readonly modelo?: string | null;
  readonly color?: string | null;
  readonly tipo?: TipoDeVehiculo;
  readonly actorId: string;
}

export interface AltaVivienda {
  readonly copropiedadId: string;
  readonly identificador: string;
  /**
   * Torre, bloque, manzana, etapa o sector. **Forma parte de la identidad**
   * desde la migración `0029`: el índice único es
   * `(copropiedad_id, coalesce(agrupacion,''), identificador)`, porque la
   * Torre 1 y la Torre 2 tienen las dos un 101.
   */
  readonly agrupacion?: string | null;
  readonly actorId: string;
}

/**
 * El alta de vivienda tiene el mismo modo de fallo esperado que la de vehículo
 * —un identificador ya usado por una vivienda activa, garantizado por índice
 * único parcial (ADR-04)— y se resuelve igual: un discriminador, no una
 * excepción. Que la restricción la imponga la base y no un `SELECT` previo es
 * lo que la hace correcta bajo concurrencia.
 */
export type ResultadoAltaVivienda =
  | { readonly tipo: 'registrada'; readonly id: string }
  | { readonly tipo: 'identificador_duplicado' };

/**
 * **Lecturas del padrón.** Son proyecciones de LECTURA, no agregados: la
 * pantalla necesita el nombre del propietario y el identificador de la
 * vivienda, y traerlos por separado sería un N+1 por fila. Salen de una
 * consulta con `JOIN` y llegan a la presentación como datos planos, que es lo
 * único que un DTO de salida debe llevar.
 */
export interface ViviendaEnLista {
  readonly id: string;
  readonly identificador: string;
  readonly agrupacion: string | null;
  readonly estado: 'activo' | 'inactivo';
  readonly estadoAdministrativo: string;
  readonly residentes: number;
  readonly vehiculos: number;
  /**
   * Autorizaciones vigentes que la vivienda conserva. RN-13: una vivienda
   * inactiva **no genera autorizaciones nuevas pero conserva las vigentes**, y
   * sin este número la interfaz no podría decirlo — diría «inactiva» a secas y
   * el administrador daría por perdido lo que sigue vivo.
   */
  readonly autorizacionesVigentes: number;
  readonly desactivadaEn: string | null;
  readonly motivoDesactivacion: string | null;
}

export interface TotalesDePadron {
  readonly activas: number;
  readonly inactivas: number;
}

export interface VehiculoEnLista {
  readonly id: string;
  readonly placa: string;
  readonly marca: string | null;
  readonly modelo: string | null;
  readonly color: string | null;
  readonly tipo: TipoDeVehiculo;
  readonly estado: 'activo' | 'inactivo';
  readonly viviendaId: string;
  readonly viviendaIdentificador: string;
  readonly propietarioId: string | null;
  readonly propietarioNombre: string | null;
}

export interface FiltroDeViviendas {
  readonly estado?: 'activo' | 'inactivo' | undefined;
  readonly busqueda?: string | undefined;
}

export interface AltaResidente {
  readonly copropiedadId: string;
  readonly viviendaId: string;
  readonly personaId: string;
  readonly esTitular: boolean;
  readonly parentesco?: string | null;
  readonly actorId: string;
}

/**
 * **Personas — la identidad compartida (D-01, RN-06).**
 *
 * Se busca por nombre O por documento porque quien autoriza tiene a mano una de
 * las dos cosas, nunca un identificador interno. El puerto recibe el texto tal
 * cual y ADEMÁS su forma normalizada de documento: así `12.345.678` encuentra a
 * quien está guardado como `12345678` sin que el adaptador tenga que conocer
 * las reglas de normalización, que viven en el objeto de valor.
 */
export interface PersonaEnLista {
  readonly id: string;
  readonly nombreCompleto: string;
  readonly tipoDocumento: TipoDeDocumento;
  readonly numeroDocumento: string;
  /** Para desempatar dos homónimos en la lista: «residente de Casa 12». */
  readonly esResidente: boolean;
  readonly viviendaIdentificador: string | null;
}

export interface AltaPersona {
  readonly copropiedadId: string;
  readonly documento: Documento;
  readonly nombreCompleto: string;
  readonly telefono?: string | null;
  readonly correo?: string | null;
  readonly actorId: string;
}

/**
 * `ya_existia` NO es un error: el documento ES la identidad (RN-06), así que
 * dar de alta a alguien que ya está resuelve a la misma persona en vez de crear
 * una segunda. El discriminador viaja hasta la consola para que pueda decirlo
 * —«ya estaba registrada como …»— en lugar de fingir que creó algo.
 *
 * Quien decide es el índice único parcial de la base, no un `SELECT` previo
 * (ADR-04): entre comprobar e insertar caben otras cien altas.
 */
export type ResultadoAltaPersona = {
  readonly tipo: 'registrada' | 'ya_existia';
  readonly id: string;
  readonly nombreCompleto: string;
};

/**
 * **La generación, y por qué es una sola llamada y no N altas.**
 *
 * Trescientas altas son trescientas sentencias y trescientas oportunidades de
 * quedarse a medias. Aquí van en una, dentro de una transacción, y quien decide
 * la unicidad es el índice único parcial (ADR-04) — no un `SELECT` previo, que
 * entre comprobar e insertar deja pasar a otro administrador generando a la vez.
 */
/**
 * ETAPA 15-D (O3) · qué hacer con las que YA EXISTEN al regenerar.
 *
 * | Modo           | Colisión activa                    | Colisión de baja               |
 * | -------------- | ---------------------------------- | ------------------------------ |
 * | `estricto`     | No se crea NINGUNA (lo que había)  | Se crea otra: la baja no choca |
 * | `conservar`    | Se conserva tal cual, se crean las demás | Se crea otra              |
 * | `sobrescribir` | Se conserva (misma identidad)      | Se REACTIVA con el plan        |
 *
 * «Sobrescribir» no borra ni renombra: una vivienda con historial no se toca
 * (RN-19). Lo único que un plan puede «escribir encima» de una existente es
 * su estado de baja, y sólo si su identidad coincide con la del plan.
 * Todo modo corre en UNA transacción: o entra todo, o nada.
 */
export type ModoDeRegeneracion = 'estricto' | 'conservar' | 'sobrescribir';

export interface GeneracionDeViviendas {
  readonly copropiedadId: string;
  readonly viviendas: readonly ViviendaProyectada[];
  readonly actorId: string;
  /** Texto del rastro en `auditoria_seguridad` (valor `generacion_de_padron`). */
  readonly resumenDelPlan: string;
  readonly modo?: ModoDeRegeneracion;
}

export interface ResultadoDeGeneracion {
  readonly creadas: number;
  /**
   * Las que ya existían activas. En modo `estricto`, si trae alguna **no se
   * creó ninguna**: la diferencia entre lo pedido y lo devuelto por el
   * `RETURNING` es la lista exacta de colisiones, y la transacción se revierte
   * entera. En `conservar` y `sobrescribir` son las que se dejaron como estaban.
   */
  readonly colisiones: readonly ViviendaProyectada[];
  /** Sólo en `sobrescribir`: las de baja que volvieron a estar activas. */
  readonly reactivadas?: number;
}

/** O3 · edición de una vivienda. Lo ausente no se toca. */
export interface EdicionDeVivienda {
  readonly copropiedadId: string;
  readonly viviendaId: string;
  readonly identificador?: string;
  readonly agrupacion?: string | null;
  /** Estado administrativo de la copropiedad hacia la vivienda (0002). */
  readonly estadoAdministrativo?: EstadoAdministrativo;
  readonly actorId: string;
}

/** Catálogo cerrado de `estado_administrativo` (migración 0002). */
export const ESTADOS_ADMINISTRATIVOS = ['al_dia', 'en_mora', 'suspendida'] as const;
export type EstadoAdministrativo = (typeof ESTADOS_ADMINISTRATIVOS)[number];

export type ResultadoEdicionVivienda =
  | { readonly tipo: 'editada' }
  | { readonly tipo: 'no_encontrada' }
  | { readonly tipo: 'identificador_duplicado' };

/** O3 · edición de un vehículo. La placa cambia por el VO, como al registrar. */
export interface EdicionDeVehiculo {
  readonly copropiedadId: string;
  readonly vehiculoId: string;
  readonly placa?: Placa;
  readonly personaId?: string | null;
  readonly marca?: string | null;
  readonly modelo?: string | null;
  readonly color?: string | null;
  readonly tipo?: TipoDeVehiculo;
  readonly actorId: string;
}

export type ResultadoEdicionVehiculo =
  | { readonly tipo: 'editado' }
  | { readonly tipo: 'no_encontrado' }
  | { readonly tipo: 'placa_activa_duplicada' };

/** Cuánto historial cuelga de un vehículo: eventos con su placa y autorizaciones. */
export interface HistorialDeVehiculo {
  readonly placa: string;
  readonly eventos: number;
  readonly autorizaciones: number;
}

/**
 * Una fila del padrón exportado. Son **las columnas que el administrador tiene
 * en su archivo** —identificador, agrupación, documento, nombre—, nunca
 * identificadores internos (D-72): lo que sale por aquí tiene que poder volver
 * a entrar por la carga sin editar nada.
 */
export interface FilaExportada {
  readonly identificador: string;
  readonly agrupacion: string | null;
  readonly documento: string | null;
  readonly tipoDocumento: string | null;
  readonly nombre: string | null;
  readonly placa: string | null;
  readonly esTitular: boolean | null;
}

/**
 * Lo que una PLACA dice del padrón, resuelto en una consulta — ETAPA 15-D, D-25.
 *
 * Es lo que el cargador de contexto del motor necesita saber de una lectura, y
 * nada más: a qué vivienda pertenece el vehículo, si esa vivienda sigue en
 * servicio y desde cuándo/hasta cuándo rige el derecho del residente (RN-13).
 * `viviendaDesactivadaEn` es el instante en que ese derecho dejó de estar
 * vigente: una vivienda dada de baja no genera accesos nuevos.
 */
export interface VehiculoResuelto {
  readonly vehiculoId: string;
  readonly viviendaId: string;
  readonly viviendaActiva: boolean;
  readonly viviendaDesactivadaEn: Date | null;
  readonly personaId: string | null;
  readonly registradoEn: Date;
}

export interface RepositorioPadron {
  /** `null` si ninguna vivienda de la copropiedad tiene un vehículo ACTIVO con esa placa. */
  resolverPlaca(copropiedadId: string, placa: Placa): Promise<VehiculoResuelto | null>;
  registrarVehiculo(alta: AltaVehiculo): Promise<ResultadoRegistroVehiculo>;
  registrarVivienda(alta: AltaVivienda): Promise<ResultadoAltaVivienda>;
  buscarPersonas(
    copropiedadId: string,
    texto: string,
    documentoNormalizado: string,
    limite: number,
  ): Promise<readonly PersonaEnLista[]>;
  registrarPersona(alta: AltaPersona): Promise<ResultadoAltaPersona>;
  /**
   * Resuelve la vivienda por el identificador que se usa en la portería
   * («Casa 12»). Lo necesita la carga de padrón: la hoja nombra la vivienda
   * como está escrita en el conjunto, no por su UUID (D-72).
   */
  buscarViviendaPorIdentificador(
    copropiedadId: string,
    agrupacion: string | null,
    identificador: string,
  ): Promise<{ readonly id: string } | null>;
  /**
   * Genera el padrón entero en **una sola sentencia**, sin `SELECT` previo.
   * Devuelve las que colisionaron para que el caso de uso las nombre todas; si
   * hay una sola, no se crea ninguna.
   */
  generarViviendas(generacion: GeneracionDeViviendas): Promise<ResultadoDeGeneracion>;
  /**
   * Cuáles del plan ya existen activas. Es una lectura **para informar**: puede
   * quedarse obsoleta entre la vista previa y la confirmación —otro
   * administrador crea una vivienda suelta en ese minuto—, y por eso NO es la
   * garantía. La garantía es el índice (ADR-04).
   */
  viviendasExistentes(
    copropiedadId: string,
    viviendas: readonly ViviendaProyectada[],
  ): Promise<readonly ViviendaProyectada[]>;
  /** Filas del padrón para exportar, en el orden en que se muestran. */
  exportarPadron(copropiedadId: string): Promise<readonly FilaExportada[]>;
  listarViviendas(
    copropiedadId: string,
    filtro: FiltroDeViviendas,
  ): Promise<{ readonly totales: TotalesDePadron; readonly viviendas: readonly ViviendaEnLista[] }>;
  listarVehiculos(copropiedadId: string): Promise<readonly VehiculoEnLista[]>;
  desactivarVehiculo(
    copropiedadId: string,
    vehiculoId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean>;
  registrarResidente(alta: AltaResidente): Promise<{ id: string } | null>;
  desactivarVivienda(
    copropiedadId: string,
    viviendaId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean>;
  /**
   * B.2 · reactivación auditada de una vivienda dada de baja.
   *
   * Respeta RN-13 sin tocarla: una vivienda inactiva no genera autorizaciones
   * nuevas pero conserva las vigentes, así que volver a activarla no resucita
   * nada — sólo deja de bloquear lo nuevo.
   */
  reactivarVivienda(copropiedadId: string, viviendaId: string, actorId: string): Promise<boolean>;
  /**
   * B.2 · qué historial tiene una vivienda, contado por clase.
   *
   * Es una LECTURA para informar y para poder decir «no se puede, y esto es lo
   * que lo impide». La garantía no está aquí: está en el disparador de la base
   * (migración 0032), que alcanza también al dueño de la tabla.
   */
  historialDeVivienda(
    copropiedadId: string,
    viviendaId: string,
  ): Promise<HistorialDeVivienda | null>;
  /**
   * B.2 · borrado DEFINITIVO, y sólo donde no hay historial. Devuelve el
   * motivo del rechazo cuando la base se niega, para que el mensaje diga qué lo
   * impide en vez de «error inesperado».
   */
  borrarViviendaDefinitivamente(
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
  ): Promise<{ readonly borrada: boolean; readonly motivo?: string }>;
  contarVehiculosActivos(copropiedadId: string, placa: Placa): Promise<number>;
  /** O3 · edición. La unicidad la decide el índice, no un SELECT previo (ADR-04). */
  editarVivienda(edicion: EdicionDeVivienda): Promise<ResultadoEdicionVivienda>;
  editarVehiculo(edicion: EdicionDeVehiculo): Promise<ResultadoEdicionVehiculo>;
  historialDeVehiculo(
    copropiedadId: string,
    vehiculoId: string,
  ): Promise<HistorialDeVehiculo | null>;
  /** O3 · borrado DEFINITIVO de vehículo, sólo sin historial (migración 0034). */
  borrarVehiculoDefinitivamente(
    copropiedadId: string,
    vehiculoId: string,
    actorId: string,
  ): Promise<{ readonly borrado: boolean; readonly motivo?: string }>;
  /** Ejecuta varias operaciones en una sola transacción (carga de padrón). */
  enTransaccion<T>(operacion: (repo: RepositorioPadron) => Promise<T>): Promise<T>;
}

/** Cuántos registros de cada clase cuelgan de una vivienda. */
export interface HistorialDeVivienda {
  readonly identificador: string;
  readonly residentes: number;
  readonly vehiculos: number;
  readonly autorizaciones: number;
  readonly eventos: number;
}

export const totalDeHistorial = (h: HistorialDeVivienda): number =>
  h.residentes + h.vehiculos + h.autorizaciones + h.eventos;

export const REPOSITORIO_PADRON = Symbol.for('ncr.puerto.RepositorioPadron');

/**
 * A4 (ETAPA 15-E) · lo que OTROS módulos pueden preguntarle al padrón sobre
 * una vivienda sin conocer su repositorio: dónde está «la unidad 305 del
 * edificio 2». Lo consume el receptor de equipos para la llamada del
 * videoportero, por su propia interfaz declarada; ésta la satisface por forma.
 */
export const LOCALIZADOR_DE_VIVIENDA = Symbol.for('ncr.padron.LocalizadorDeVivienda');

export interface LocalizadorDeVivienda {
  porUnidad(
    copropiedadId: string,
    agrupacion: string | null,
    identificador: string,
  ): Promise<{ readonly id: string; readonly identificador: string } | null>;
}
