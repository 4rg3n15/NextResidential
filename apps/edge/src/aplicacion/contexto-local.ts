/**
 * Instantánea + hecho → `ContextoDeAcceso`, con la MISMA semántica que el
 * cargador de la nube (`apps/api/.../cargador-pg.ts`). RN-16, CA-21.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ SE REESCRIBIÓ EN LA 15-Q
 *
 * Hasta la 15-Q la caché nunca se llenaba (S-24) y nadie notó que el Edge
 * armaba el contexto distinto de la nube en tres casos que la instantánea real
 * pone a prueba el primer día:
 *
 *  1. la placa de un VISITANTE (la de su autorización, no la del padrón): la
 *     nube la reconoce por `autorizaciones.placa`; el Edge la daba por
 *     desconocida y negaba lo que la nube permite;
 *  2. el derecho del residente (S-33) es una autorización sintética que la nube
 *     sólo aplica a la lectura de SU vehículo; el Edge la habría aplicado a
 *     cualquier hecho de esa persona;
 *  3. la vivienda «activa» de una visita: la nube la da por activa si hay una
 *     autorización que lo diga (RN-13: la vivienda de baja conserva las
 *     vigentes); el Edge miraba sólo la lista de viviendas activas.
 *
 * Y la placa se normaliza con el objeto de valor `Placa`, como en la nube: una
 * lectura «abc-123» no puede ser desconocida en un sitio y conocida en el otro.
 *
 * LO QUE NO HACE: decidir. Arma datos y se aparta; decide `evaluarAcceso`.
 * La equivalencia con la nube se prueba contra la base real en
 * `apps/api/test/edge-misma-decision-pg.e2e.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import {
  Autorizacion,
  FranjaHoraria,
  HorarioDeZona,
  PatronRecurrencia,
  Placa,
  VersionDeReglas,
  Vigencia,
  esExito,
  esFallo,
} from '@ncr/domain-core';
import type { ContextoDeAcceso, ZonaSolicitada } from '@ncr/domain-core';
import type {
  AutorizacionEnCache,
  HechoLocal,
  IdentidadResuelta,
  InstantaneaDeReglas,
  ZonaEnCache,
} from './instantanea-de-reglas';

/** Como la nube: el objeto de valor decide; lo que no forma placa va recortado y en mayúsculas. */
const placaNormalizada = (leida: string | null): string | null => {
  if (leida === null || leida.trim() === '') return null;
  const placa = Placa.crear(leida);
  return esExito(placa) ? placa.valor.valor : leida.trim().toUpperCase();
};

const esDerechoDeResidente = (a: AutorizacionEnCache): boolean => a.id.startsWith('residente:');

/**
 * 15-X · D1 · el derecho del residente por su ROSTRO (`residente:persona:`):
 * sólo para un acceso FACIAL de esa persona, como la nube lo pide a
 * `ResidentesPorPersona`. La instantánea trae a lo sumo uno por persona: la
 * nube y el Edge lo leen con la misma consulta.
 */
const derechoPorRostro = (
  i: InstantaneaDeReglas,
  hecho: HechoLocal,
): AutorizacionEnCache | undefined =>
  hecho.metodo !== 'facial' || hecho.personaId === null
    ? undefined
    : i.autorizaciones.find(
        (a) => a.id.startsWith('residente:persona:') && a.personaId === hecho.personaId,
      );

/**
 * Las autorizaciones que la nube leería con `activasParaLectura({placa, persona})`:
 * las de visitante con esa placa o de esa persona, la de vencimiento más tardío
 * primero (el `ORDER BY upper(vigencia) DESC` de la nube).
 */
const deVisita = (
  i: InstantaneaDeReglas,
  placa: string | null,
  personaId: string | null,
): readonly AutorizacionEnCache[] =>
  i.autorizaciones
    .filter(
      (a) =>
        !esDerechoDeResidente(a) &&
        ((placa !== null && (a.placa ?? null) === placa) ||
          (personaId !== null && a.personaId === personaId)),
    )
    .slice()
    .sort((x, y) => (x.hasta < y.hasta ? 1 : x.hasta > y.hasta ? -1 : 0));

/**
 * Resuelve la identidad SOLO por lo que la caché conoce. Una placa que no está
 * en el padrón ni en una autorización de visita no se «intenta igual»: queda
 * desconocida y el motor decide qué hacer con eso.
 */
export const resolverIdentidad = (
  instantanea: InstantaneaDeReglas,
  hecho: HechoLocal,
): IdentidadResuelta => {
  const placa = placaNormalizada(hecho.placaLeida);
  const vehiculo =
    placa === null ? undefined : instantanea.vehiculos.find((v) => v.placa === placa);
  if (vehiculo !== undefined) {
    return { personaId: vehiculo.personaId, viviendaId: vehiculo.viviendaId, placaConocida: true };
  }
  const visitas = deVisita(instantanea, placa, hecho.personaId);
  return {
    personaId: hecho.personaId,
    // Como la nube: el residente del rostro antes que la visita.
    viviendaId: derechoPorRostro(instantanea, hecho)?.viviendaId ?? visitas[0]?.viviendaId ?? null,
    placaConocida: placa !== null && visitas.length > 0,
  };
};

const autorizacionDesde = (a: AutorizacionEnCache, copropiedadId: string): Autorizacion | null => {
  const vigencia = Vigencia.crear(new Date(a.desde), new Date(a.hasta));
  if (esFallo(vigencia)) return null;
  let patron: PatronRecurrencia | null = null;
  if (a.patron !== null) {
    const p = PatronRecurrencia.crear({ ...a.patron, dias: [...a.patron.dias] });
    // Un patrón corrupto NO deja la autorización sin patrón —sería abrir de
    // más—: se descarta entera y el motor resuelve sin ella (§2.1.4).
    if (esFallo(p)) return null;
    patron = p.valor;
  }
  // `rehidratar` y no `crear`: lo que está en la caché YA ocurrió.
  return Autorizacion.rehidratar({
    id: a.id,
    copropiedadId,
    viviendaId: a.viviendaId,
    personaId: a.personaId,
    vigencia: vigencia.valor,
    estado: a.estado,
    acompanantes: a.acompanantes,
    zonasPermitidas: a.zonasPermitidas,
    patron,
    maximoAcompanantes: a.maximoAcompanantes,
    revocadaEn: null,
    motivoRevocacion: null,
  });
};

const zonaDesde = (z: ZonaEnCache, ahora: Date): ZonaSolicitada => {
  const franjas: FranjaHoraria[] = [];
  for (const f of z.franjas) {
    const creada = FranjaHoraria.crear({
      dia: f.dia,
      minutoInicio: f.minutoInicio,
      minutoFin: f.minutoFin,
      ...(f.continuaDelDiaAnterior === undefined
        ? {}
        : { continuaDelDiaAnterior: f.continuaDelDiaAnterior }),
    });
    if (!esFallo(creada)) franjas.push(creada.valor);
  }
  const horario = HorarioDeZona.crear(franjas, z.desplazamientoUtcMinutos);
  // Sin horario legible, o cerrada por el operador, la zona está CERRADA (§2.1.4).
  const dentroDeHorario =
    (z.abierta ?? true) && !esFallo(horario) && horario.valor.estaAbiertaEn(ahora);
  return {
    id: z.id,
    dentroDeHorario,
    aforoCompleto: z.aforoMaximo > 0 && z.ocupacionActual >= z.aforoMaximo,
    restringida: z.restringida,
  };
};

/**
 * RN-09 como la nube: el consentimiento sólo cuenta para un acceso FACIAL, y
 * con las plantillas de la instantánea se mide en el instante del hecho (una
 * que vence durante el corte deja de reconocerse a su hora). Sin plantillas
 * —una instantánea anterior a la 15-Q— se usa la lista de la generación.
 */
const consentimientoVigente = (
  i: InstantaneaDeReglas,
  hecho: HechoLocal,
  persona: string | null,
) => {
  if (persona === null) return false;
  if (i.plantillas === undefined || hecho.metodo !== 'facial') {
    return i.personasConConsentimiento.includes(persona);
  }
  return i.plantillas.some(
    (p) =>
      p.personaId === persona &&
      p.reconocibleHasta !== null &&
      hecho.ocurridoEn < new Date(p.reconocibleHasta),
  );
};

/**
 * Instantánea + hecho → `ContextoDeAcceso`. **El mismo tipo que usa la nube.**
 * `null` si la versión no es construible: lo resuelve la contingencia.
 */
export const contextoDesde = (
  instantanea: InstantaneaDeReglas,
  hecho: HechoLocal,
  identidad: IdentidadResuelta,
): ContextoDeAcceso | null => {
  const version = VersionDeReglas.crear(instantanea.version, instantanea.copropiedadId);
  if (esFallo(version)) return null;

  const placa = placaNormalizada(hecho.placaLeida);
  const vehiculo =
    placa === null ? undefined : instantanea.vehiculos.find((v) => v.placa === placa);
  // El marcador `vehiculo:<id>` de un vehículo sin dueño no es una persona.
  const persona =
    identidad.personaId !== null && identidad.personaId.startsWith('vehiculo:')
      ? null
      : identidad.personaId;
  const visitas = deVisita(instantanea, placa, identidad.personaId);
  const porRostro = derechoPorRostro(instantanea, hecho);
  const derecho = [
    ...(vehiculo?.vehiculoId === undefined
      ? []
      : instantanea.autorizaciones.filter((a) => a.id === `residente:${vehiculo.vehiculoId}`)),
    ...(porRostro === undefined ? [] : [porRostro]),
  ];
  const autorizaciones = [...derecho, ...visitas]
    .map((a) => autorizacionDesde(a, instantanea.copropiedadId))
    .filter((a): a is Autorizacion => a !== null);
  const zonaEnCache =
    hecho.zonaId === null ? undefined : instantanea.zonas.find((z) => z.id === hecho.zonaId);

  return {
    ahora: hecho.ocurridoEn,
    copropiedadId: instantanea.copropiedadId,
    versionDeReglas: version.valor,
    personaId: persona,
    viviendaId: identidad.viviendaId,
    metodo: hecho.metodo,
    autorizaciones,
    personasEnListaNegra: new Set(instantanea.personasEnListaNegra),
    placasEnListaNegra: new Set(instantanea.placasEnListaNegra),
    placaLeida: placa,
    placaConocida: identidad.placaConocida,
    viviendaActiva:
      vehiculo !== undefined
        ? instantanea.viviendasActivas.includes(vehiculo.viviendaId)
        : porRostro !== undefined
          ? instantanea.viviendasActivas.includes(porRostro.viviendaId)
          : visitas.length > 0,
    zona:
      hecho.zonaId === null
        ? null
        : zonaEnCache === undefined
          ? // Una zona que la caché no conoce: restringida y cerrada. Más estricto
            // que la nube (que la ignora), a propósito: sin WAN, no se adivina.
            { id: hecho.zonaId, dentroDeHorario: false, aforoCompleto: false, restringida: true }
          : zonaDesde(zonaEnCache, hecho.ocurridoEn),
    confianza: hecho.confianza,
    umbralDeConfianza: instantanea.umbralDeConfianza,
    consentimientoVigente: consentimientoVigente(instantanea, hecho, persona),
  };
};
