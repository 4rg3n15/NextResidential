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

export interface AltaVehiculo {
  readonly copropiedadId: string;
  readonly viviendaId: string;
  readonly personaId: string | null;
  readonly placa: Placa;
  readonly marca?: string | null;
  readonly modelo?: string | null;
  readonly color?: string | null;
  readonly actorId: string;
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
