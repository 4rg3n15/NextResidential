/**
 * 15-Q2 · lo que la composición del Edge acepta para funcionar como PUENTE
 * (`composicion-puente.ts`) sin dejar de ser la de la 15-Q: el registro de
 * equipos cifrado, la sonda inmediata (sin túnel, la nube no atiende), el
 * ingestor que reenvía a la nube y los equipos y cámaras que vienen de él.
 */
import type { IngestorDePublicaciones, RegistroDeEquipos } from '@ncr/providers';
import type { SondaDeEnlace } from './aplicacion/puertos';
import type { CamaraDelEdge } from './infraestructura/http/servidor-local';
import type { BaseSqlite } from './infraestructura/sqlite/motor';

export interface ExtrasDelPuente {
  readonly registro?: (db: BaseSqlite) => RegistroDeEquipos;
  readonly sondaInmediata?: SondaDeEnlace;
  readonly envolverIngestor?: (local: IngestorDePublicaciones) => IngestorDePublicaciones;
  readonly equipos?: () => readonly { readonly dispositivoId: string; readonly tipo: string }[];
  /** La MISMA lista que lee el receptor local: se actualiza en sitio, sin reiniciar. */
  readonly camaras?: CamaraDelEdge[];
}
