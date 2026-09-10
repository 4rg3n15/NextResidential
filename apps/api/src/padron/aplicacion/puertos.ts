import type { Placa } from '@ncr/domain-core';

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
  readonly manzana?: string | null;
  readonly direccion?: string | null;
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
  readonly manzana: string | null;
  readonly direccion: string | null;
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

export interface RepositorioPadron {
  registrarVehiculo(alta: AltaVehiculo): Promise<ResultadoRegistroVehiculo>;
  registrarVivienda(alta: AltaVivienda): Promise<ResultadoAltaVivienda>;
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
  contarVehiculosActivos(copropiedadId: string, placa: Placa): Promise<number>;
  /** Ejecuta varias operaciones en una sola transacción (carga de padrón). */
  enTransaccion<T>(operacion: (repo: RepositorioPadron) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_PADRON = Symbol.for('ncr.puerto.RepositorioPadron');
