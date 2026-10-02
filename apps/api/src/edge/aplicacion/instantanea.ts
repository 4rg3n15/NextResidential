import { createHash } from 'node:crypto';
import type { Autorizacion } from '@ncr/domain-core';
import { derechoDelResidente } from '../../autorizaciones';
import type { LecturasDeReglas, PlantillaLeida, VehiculoDelPadron, ZonaLeida } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA INSTANTÁNEA QUE EL EDGE DESCARGA · 15-Q (Q1) · cierra S-24
 *
 * Una función pura: las lecturas de una copropiedad entran, el documento que
 * viaja sale. El formato es el que el Edge ya sabía leer desde la ETAPA 12
 * (`apps/edge/src/aplicacion/instantanea-de-reglas.ts`), con tres añadidos que
 * la nube usa para decidir y el Edge no tenía —la placa de la autorización de
 * visitante, la zona cerrada por el operador y la plantilla que reconoce cada
 * terminal—: sin ellos el Edge negaba lo que la nube permite (RN-16).
 *
 * LO QUE NO VIAJA, a propósito (Ley 1581, minimización):
 *  · ningún vector biométrico: de la plantilla va el identificador y hasta
 *    cuándo se reconoce, nada más;
 *  · ningún nombre: el acompañante va por su identificador. El motor no lee
 *    nombres; un Edge robado no debe ser un directorio de visitantes.
 *
 * El HASH es del contenido, no de la versión ni del instante: dos lecturas
 * iguales dan el mismo hash, y es lo que decide si hay que publicar una versión
 * nueva (`publicar-instantanea.ts`) — la versión sólo avanza cuando las reglas
 * cambiaron de verdad.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface AutorizacionParaElEdge {
  readonly id: string;
  readonly viviendaId: string;
  readonly personaId: string;
  readonly desde: string;
  readonly hasta: string;
  readonly estado: 'vigente' | 'revocada';
  readonly zonasPermitidas: readonly string[];
  readonly acompanantes: readonly { readonly personaId: string; readonly nombre: string }[];
  readonly maximoAcompanantes: number;
  readonly patron: {
    readonly dias: readonly number[];
    readonly minutoInicio: number;
    readonly minutoFin: number;
    readonly desplazamientoUtcMinutos: number;
  } | null;
  readonly placa: string | null;
}

export interface ContenidoDeReglas {
  readonly autorizaciones: readonly AutorizacionParaElEdge[];
  readonly personasEnListaNegra: readonly string[];
  readonly placasEnListaNegra: readonly string[];
  readonly viviendasActivas: readonly string[];
  readonly vehiculos: readonly {
    readonly placa: string;
    readonly vehiculoId: string;
    readonly personaId: string;
    readonly viviendaId: string;
  }[];
  readonly zonas: readonly (Omit<ZonaLeida, 'franjas'> & {
    readonly restringida: true;
    readonly franjas: ZonaLeida['franjas'];
  })[];
  readonly personasConConsentimiento: readonly string[];
  readonly plantillas: readonly {
    readonly plantillaId: string;
    readonly personaId: string;
    readonly reconocibleHasta: string | null;
  }[];
  readonly umbralDeConfianza: number;
}

export interface InstantaneaParaElEdge extends ContenidoDeReglas {
  readonly copropiedadId: string;
  readonly version: number;
  readonly hash: string;
  readonly generadaEn: string;
}

const porClave =
  <T>(clave: (x: T) => string) =>
  (a: T, b: T): number =>
    clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0;

const unicos = (valores: readonly (string | null)[]): string[] =>
  [...new Set(valores.filter((v): v is string => v !== null))].sort();

const autorizacionParaElEdge = (a: Autorizacion): AutorizacionParaElEdge => ({
  id: a.id,
  viviendaId: a.viviendaId,
  personaId: a.personaId,
  desde: a.vigencia.desde.toISOString(),
  hasta: a.vigencia.hasta.toISOString(),
  estado: a.estado,
  zonasPermitidas: [...a.zonasPermitidas].sort(),
  // Minimización: el motor no lee el nombre del acompañante.
  acompanantes: a.acompanantes.map((x) => ({ personaId: x.personaId, nombre: '' })),
  maximoAcompanantes: a.maximoAcompanantes,
  patron:
    a.patron === null
      ? null
      : {
          dias: [...a.patron.dias],
          minutoInicio: a.patron.minutoInicio,
          minutoFin: a.patron.minutoFin,
          desplazamientoUtcMinutos: a.patron.desplazamientoUtcMinutos,
        },
  placa: a.placa?.valor ?? null,
});

/** La persona que el Edge asocia a la placa: la misma que la autorización sintética. */
const personaDelVehiculo = (v: VehiculoDelPadron): string =>
  v.personaId ?? `vehiculo:${v.vehiculoId}`;

const reconocibles = (plantillas: readonly PlantillaLeida[], ahora: Date): string[] =>
  unicos(
    plantillas
      .filter((p) => p.reconocibleHasta !== null && ahora < p.reconocibleHasta)
      .map((p) => p.personaId),
  );

/** Lecturas → contenido ordenado. Mismo orden, mismo hash. */
export const contenidoDe = (
  copropiedadId: string,
  lecturas: LecturasDeReglas,
  ahora: Date,
): ContenidoDeReglas => {
  // El derecho del residente entra como autorización sintética, con la MISMA
  // función que usa el cargador de la nube (RN-16).
  const sinteticas = lecturas.vehiculos
    .map((v) => derechoDelResidente(copropiedadId, v))
    .filter((a): a is Autorizacion => a !== null);
  return {
    autorizaciones: [...sinteticas, ...lecturas.autorizaciones]
      .map(autorizacionParaElEdge)
      .sort(porClave((a) => a.id)),
    personasEnListaNegra: unicos(lecturas.vetos.map((v) => v.personaId)),
    placasEnListaNegra: unicos(lecturas.vetos.map((v) => v.placa)),
    viviendasActivas: unicos(lecturas.viviendasActivas),
    vehiculos: lecturas.vehiculos
      .map((v) => ({
        placa: v.placa,
        // El derecho del residente es `residente:<vehiculoId>`: el Edge lo
        // aplica SÓLO a la lectura de ESTE vehículo, como la nube.
        vehiculoId: v.vehiculoId,
        personaId: personaDelVehiculo(v),
        viviendaId: v.viviendaId,
      }))
      .sort(porClave((v) => v.placa)),
    zonas: lecturas.zonas
      .map((z) => ({ ...z, restringida: true as const }))
      .sort(porClave((z) => z.id)),
    personasConConsentimiento: reconocibles(lecturas.plantillas, ahora),
    plantillas: lecturas.plantillas
      .map((p) => ({
        plantillaId: p.plantillaId,
        personaId: p.personaId,
        reconocibleHasta: p.reconocibleHasta?.toISOString() ?? null,
      }))
      .sort(porClave((p) => p.plantillaId)),
    umbralDeConfianza: lecturas.umbralDeConfianza,
  };
};

export const hashDe = (contenido: ContenidoDeReglas): string =>
  createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
