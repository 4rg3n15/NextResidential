import type { Zona } from '@ncr/domain-core';

/**
 * Puertos del módulo de zonas. La aplicación los DEFINE; la infraestructura los
 * cumple (§2.2, DIP).
 */

/**
 * Resultado del intento de ocupar una plaza.
 *
 * **`aforo_superado` es un valor, no una excepción**, y llega desde la base sin
 * que nadie haya comprobado nada antes: el adaptador ejecuta
 *
 *   UPDATE zona_aforo SET conteo_actual = conteo_actual + 1
 *    WHERE zona_id = $1 AND conteo_actual < aforo_maximo
 *   RETURNING conteo_actual;
 *
 * y **cero filas devueltas ES el aforo superado** (ADR-04, CA-14). No hay
 * `SELECT` previo, y por tanto no hay ventana entre comprobar y ocupar: es la
 * misma lección que KPI-03 dejó con las placas. Un doble en memoria puede
 * imitar la semántica, pero la garantía la da el `CHECK (conteo_actual <=
 * aforo_maximo)` de la migración 0007, que hace la violación estructuralmente
 * imposible venga de donde venga la escritura.
 */
export type ResultadoOcupacion =
  | { readonly tipo: 'ocupado'; readonly conteo: number }
  | { readonly tipo: 'aforo_superado'; readonly conteo: number }
  | { readonly tipo: 'zona_no_encontrada' };

export interface RepositorioZonas {
  porId(copropiedadId: string, zonaId: string): Promise<Zona | null>;
  listar(copropiedadId: string): Promise<readonly Zona[]>;
  guardar(zona: Zona, actorId: string): Promise<void>;

  /** Incremento ATÓMICO. Ver `ResultadoOcupacion`. */
  ocupar(copropiedadId: string, zonaId: string): Promise<ResultadoOcupacion>;

  /**
   * Decremento atómico con suelo en cero. El suelo va en el `WHERE`, no en el
   * código: una salida sin su entrada —un sensor que falló, CU-05 6a— no puede
   * dejar el contador en negativo y regalar plazas el resto de la jornada.
   */
  liberar(copropiedadId: string, zonaId: string): Promise<number>;

  /** Reinicio del contador. La DECISIÓN de reiniciar es del dominio. */
  reiniciar(copropiedadId: string, zonaId: string, ahora: Date): Promise<void>;
}

export interface RepositorioAutorizacionesZona {
  autorizar(
    copropiedadId: string,
    autorizacionId: string,
    zonaId: string,
    actorId: string,
  ): Promise<boolean>;
  zonasDe(copropiedadId: string, autorizacionId: string): Promise<readonly string[]>;
}

export const REPOSITORIO_ZONAS = Symbol.for('ncr.puerto.RepositorioZonas');
export const REPOSITORIO_AUTORIZACIONES_ZONA = Symbol.for(
  'ncr.puerto.RepositorioAutorizacionesZona',
);
