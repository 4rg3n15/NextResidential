import type { Autorizacion } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';

/**
 * Los puertos del módulo `edge` (15-Q). La aplicación declara; la
 * infraestructura cumple, con PostgreSQL o en memoria (DIP, §2.3).
 */

/** Un gateway de `edge_gateways` (D-16), sin secreto: sólo su referencia. */
export interface GatewayRegistrado {
  readonly id: string;
  readonly copropiedadId: string;
  readonly nombre: string;
  readonly usuarioServicioId: string;
  readonly credencialRef: string;
  readonly activo: boolean;
}

export interface RepositorioDeGateways {
  /**
   * Por identificador, de CUALQUIER copropiedad: es lo que permite saber que
   * un Edge pidió las reglas de otra y dejarlo en la auditoría (RN-15). La
   * comprobación de copropiedad la hace la aplicación, no la RLS, porque la
   * ruta del Edge no tiene sesión de usuario.
   */
  porId(id: string): Promise<GatewayRegistrado | null>;
  /** Qué versión se le entregó y cuándo se oyó de él (la observabilidad de D-16). */
  anotarDescarga(gateway: GatewayRegistrado, version: number, ahora: Date): Promise<void>;
  /** Alta por el superadministrador (`edge_insercion`). */
  registrar(ctx: ContextoTenant, copropiedadId: string, nombre: string): Promise<GatewayRegistrado>;
  /** Nueva generación de la credencial. `null` si no existe o está de baja. */
  rotar(
    ctx: ContextoTenant,
    copropiedadId: string,
    edgeId: string,
  ): Promise<GatewayRegistrado | null>;
}

/** Un vehículo activo del padrón, como lo resuelve `ResolutorDePlaca`. */
export interface VehiculoDelPadron {
  readonly placa: string;
  readonly vehiculoId: string;
  readonly viviendaId: string;
  readonly viviendaActiva: boolean;
  readonly viviendaDesactivadaEn: Date | null;
  readonly personaId: string | null;
  readonly registradoEn: Date;
}

export interface ZonaLeida {
  readonly id: string;
  /** Activa y abierta por el operador. Una zona cerrada no abre por horario. */
  readonly abierta: boolean;
  readonly aforoMaximo: number;
  readonly ocupacionActual: number;
  readonly desplazamientoUtcMinutos: number;
  readonly franjas: readonly {
    readonly dia: number;
    readonly minutoInicio: number;
    readonly minutoFin: number;
    readonly continuaDelDiaAnterior: boolean;
  }[];
}

/**
 * Una plantilla que alguna terminal puede reconocer. El IDENTIFICADOR y su
 * titular; nunca el vector (Ley 1581, RN-09).
 */
export interface PlantillaLeida {
  readonly plantillaId: string;
  readonly personaId: string;
  /** Hasta cuándo la reconoce el motor (`suprimir_en`); `null` si ya no. */
  readonly reconocibleHasta: Date | null;
}

/** Todo lo que el motor necesita de una copropiedad, leído de una vez. */
export interface LecturasDeReglas {
  readonly autorizaciones: readonly Autorizacion[];
  readonly vehiculos: readonly VehiculoDelPadron[];
  readonly viviendasActivas: readonly string[];
  readonly vetos: readonly { readonly personaId: string | null; readonly placa: string | null }[];
  readonly zonas: readonly ZonaLeida[];
  readonly plantillas: readonly PlantillaLeida[];
  readonly umbralDeConfianza: number;
}

export interface FuenteDeReglas {
  leer(copropiedadId: string, ahora: Date): Promise<LecturasDeReglas>;
}

export interface VersionPublicada {
  readonly numero: number;
  readonly hash: string;
}

export interface PublicadorDeVersiones {
  ultima(copropiedadId: string): Promise<VersionPublicada | null>;
  /** `false` si otra publicación ganó ese número (índice único, ADR-04). */
  publicar(copropiedadId: string, version: VersionPublicada, actorId: string): Promise<boolean>;
}

export const REPOSITORIO_DE_GATEWAYS = Symbol.for('ncr.edge.RepositorioDeGateways');
export const FUENTE_DE_REGLAS = Symbol.for('ncr.edge.FuenteDeReglas');
export const PUBLICADOR_DE_VERSIONES = Symbol.for('ncr.edge.PublicadorDeVersiones');
