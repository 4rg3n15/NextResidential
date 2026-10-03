import type { ContextoTenant } from '../../autenticacion';

/**
 * 15-Q2 · ADR-035 · qué Edge es el PUENTE de su copropiedad (`edge_gateways.puente`,
 * 0050), y la ficha que la consola enseña de cada uno. Puerto propio y no un
 * método más de `RepositorioDeGateways`: el puente es la decisión de esta ronda
 * y vive aparte de la identidad (15-Q), que no cambia.
 */
export interface FichaDeEdge {
  readonly id: string;
  readonly nombre: string;
  readonly puente: boolean;
  readonly puenteDesde: Date | null;
  /** La última vez que la API oyó de él por HTTP (descarga de reglas). */
  readonly ultimoLatido: Date | null;
  readonly versionDeReglas: number;
}

export type ResultadoDeMarca = 'marcado' | 'no_encontrado' | 'otro_puente';

export interface RepositorioDePuentes {
  /** Con la identidad de lectura del proceso: lo usa la puerta del túnel. */
  esPuente(edgeId: string): Promise<boolean>;
  /** Los Edge activos de la copropiedad, con la sesión de quien pregunta (RLS). */
  deCopropiedad(ctx: ContextoTenant, copropiedadId: string): Promise<readonly FichaDeEdge[]>;
  /**
   * Marca o desmarca el puente. Dos puentes en una copropiedad los impide el
   * índice único (ADR-04), no una lectura previa: `otro_puente`.
   */
  marcar(
    ctx: ContextoTenant,
    copropiedadId: string,
    edgeId: string,
    puente: boolean,
    ahora: Date,
  ): Promise<ResultadoDeMarca>;
}

export const REPOSITORIO_DE_PUENTES = Symbol.for('ncr.edge.RepositorioDePuentes');
