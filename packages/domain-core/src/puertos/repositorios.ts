/**
 * Puertos de repositorio, uno por agregado raíz (§2.2, nueve agregados).
 *
 * ISP: cada puerto expone lo que su caso de uso necesita, no un CRUD genérico.
 * Los tipos de agregado llegan en las etapas 04-08; aquí se fija la FRONTERA,
 * que es lo que la etapa 02 debe demostrar. Se parametrizan para no inventar
 * hoy una forma de agregado que el dominio aún no ha definido.
 */
export interface RepositorioPorId<T, Id = string> {
  buscarPorId(id: Id): Promise<T | null>;
}

export interface RepositorioGuardable<T> {
  guardar(entidad: T): Promise<void>;
}

export interface ViviendaRepo<T = unknown> extends RepositorioPorId<T>, RepositorioGuardable<T> {}
export interface AutorizacionRepo<T = unknown>
  extends RepositorioPorId<T>,
    RepositorioGuardable<T> {}
export interface ZonaRepo<T = unknown> extends RepositorioPorId<T>, RepositorioGuardable<T> {}
export interface ReglaRepo<T = unknown> extends RepositorioPorId<T> {}
export interface ListaNegraRepo<T = unknown> extends RepositorioPorId<T>, RepositorioGuardable<T> {}
export interface DispositivoRepo<T = unknown>
  extends RepositorioPorId<T>,
    RepositorioGuardable<T> {}
export interface ConsentimientoRepo<T = unknown>
  extends RepositorioPorId<T>,
    RepositorioGuardable<T> {}
export interface PlantillaRepo<T = unknown> extends RepositorioPorId<T>, RepositorioGuardable<T> {}

/**
 * `EventoRepo` NO extiende `RepositorioGuardable`: `guardar` sugiere «crea o
 * actualiza», y un evento no se actualiza jamás (RN-03, ADR-005). El puerto
 * solo ofrece `anexar`, así que la inmutabilidad se lee en el tipo antes de
 * llegar a los permisos de la base.
 */
export interface EventoRepo<T = unknown> extends RepositorioPorId<T> {
  anexar(evento: T, claveIdempotencia: string): Promise<void>;
}
