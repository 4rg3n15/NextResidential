/**
 * La caché de reglas del Edge: qué guarda, y cómo se convierte en contexto.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ LA CACHÉ ES UNA INSTANTÁNEA VERSIONADA Y NO UNA COPIA DE TABLAS
 *
 * Lo tentador es replicar las tablas de la nube en SQLite y consultarlas igual.
 * Se descartó por lo que RN-16 y CA-21 exigen demostrar: que **la misma
 * decisión se produce en los dos sitios**. Con tablas replicadas, la decisión
 * depende de cómo consulte cada lado, y dos consultas parecidas con un `JOIN`
 * distinto son dos sistemas de reglas que se parecen.
 *
 * Una instantánea cerrada y numerada, en cambio, es exactamente lo que
 * `ContextoDeAcceso` pide: «todo lo que el motor necesita, ya resuelto». El
 * Edge no consulta nada durante la evaluación —igual que la nube— y el número
 * de versión es lo que después permite explicar por qué decidió así.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTE FICHERO NO HACE, Y ES LO IMPORTANTE
 *
 * **No decide.** Arma el contexto y se aparta. La decisión la toma
 * `evaluarAcceso` de `@ncr/domain-core`, sin una línea de lógica de acceso
 * escrita aquí. Si en este fichero apareciera un `if` sobre vigencias o listas
 * negras, el Edge tendría su propio criterio y RN-16 dejaría de cumplirse el
 * día que los dos se separaran — en silencio, que es como se separan.
 */
import {
  Autorizacion,
  HorarioDeZona,
  VersionDeReglas,
  Vigencia,
  PatronRecurrencia,
  FranjaHoraria,
  esFallo,
} from '@ncr/domain-core';
import type { ContextoDeAcceso, MetodoDeAcceso, ZonaSolicitada } from '@ncr/domain-core';

/** Una autorización tal como viaja y se guarda: plana, serializable. */
export interface AutorizacionEnCache {
  readonly id: string;
  readonly viviendaId: string;
  readonly personaId: string;
  readonly desde: string;
  readonly hasta: string;
  /**
   * Solo `vigente` o `revocada`: son los dos estados del dominio. «Expirada» no
   * es un estado guardado y no debe serlo —lo dice la `Vigencia` comparada con
   * el instante—, porque una tercera casilla se quedaría desactualizada en la
   * caché justo mientras el Edge está sin conexión y no puede refrescarla.
   */
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
}

export interface VehiculoEnCache {
  /** Ya normalizada por la nube; el Edge no reinventa la normalización. */
  readonly placa: string;
  readonly personaId: string;
  readonly viviendaId: string;
}

export interface ZonaEnCache {
  readonly id: string;
  readonly restringida: boolean;
  readonly aforoMaximo: number;
  readonly ocupacionActual: number;
  readonly desplazamientoUtcMinutos: number;
  readonly franjas: readonly {
    readonly dia: number;
    readonly minutoInicio: number;
    readonly minutoFin: number;
    readonly continuaDelDiaAnterior?: boolean;
  }[];
}

export interface InstantaneaDeReglas {
  readonly copropiedadId: string;
  /** El número que se sella en cada decisión tomada con esta caché (CA-21). */
  readonly version: number;
  /** Cuándo la produjo la NUBE. Es lo que mide la obsolescencia, no la llegada. */
  readonly generadaEn: string;
  readonly autorizaciones: readonly AutorizacionEnCache[];
  readonly personasEnListaNegra: readonly string[];
  readonly placasEnListaNegra: readonly string[];
  readonly viviendasActivas: readonly string[];
  readonly vehiculos: readonly VehiculoEnCache[];
  readonly zonas: readonly ZonaEnCache[];
  readonly personasConConsentimiento: readonly string[];
  readonly umbralDeConfianza: number;
}

/**
 * ¿Es esta instantánea USABLE? · encontrado al escribir la prueba de la caché
 * ilegible.
 *
 * Una fila truncada —un corte de luz a mitad de la escritura, un disco lleno,
 * una versión anterior del formato— produce un objeto al que le faltan
 * colecciones. Sin esta comprobación, el primer `.find()` sobre `undefined`
 * lanzaba una excepción y **tumbaba el gateway**. En un equipo de portería eso
 * no es una traza en un registro: es una puerta que deja de abrirse.
 *
 * Se comprueba la FORMA, no el contenido: que estén las colecciones que el
 * contexto recorre y que la versión sea un entero. Validar el contenido sería
 * volver a implementar el dominio aquí. Lo que falta o está mal se trata como
 * «no hay caché», y la contingencia decide — que es una decisión escrita y
 * configurable, no una excepción.
 */
export const instantaneaUsable = (x: unknown): x is InstantaneaDeReglas => {
  if (x === null || typeof x !== 'object') return false;
  const i = x as Partial<InstantaneaDeReglas>;
  if (typeof i.copropiedadId !== 'string' || i.copropiedadId.length === 0) return false;
  if (!Number.isInteger(i.version) || (i.version as number) < 1) return false;
  if (typeof i.generadaEn !== 'string') return false;
  if (typeof i.umbralDeConfianza !== 'number') return false;
  const colecciones: readonly (keyof InstantaneaDeReglas)[] = [
    'autorizaciones',
    'personasEnListaNegra',
    'placasEnListaNegra',
    'viviendasActivas',
    'vehiculos',
    'zonas',
    'personasConConsentimiento',
  ];
  return colecciones.every((c) => Array.isArray(i[c]));
};

/** El hecho que llega del hardware, antes de saber quién es. */
export interface HechoLocal {
  readonly dispositivoId: string;
  readonly metodo: MetodoDeAcceso;
  readonly referenciaExterna: string;
  readonly confianza: number;
  readonly placaLeida: string | null;
  readonly personaId: string | null;
  readonly zonaId: string | null;
  readonly ocurridoEn: Date;
}

/** Quién resultó ser, según la caché. */
export interface IdentidadResuelta {
  readonly personaId: string | null;
  readonly viviendaId: string | null;
  readonly placaConocida: boolean;
}

/**
 * Resuelve la identidad SOLO por lo que la caché conoce.
 *
 * Una placa que no está en la instantánea no se «intenta igual»: se marca como
 * desconocida y el motor decide qué hacer con eso (`politicaPlacaConocida`).
 * Adivinar aquí sería tomar una decisión de acceso fuera del motor.
 */
export const resolverIdentidad = (
  instantanea: InstantaneaDeReglas,
  hecho: HechoLocal,
): IdentidadResuelta => {
  if (hecho.placaLeida !== null) {
    const v = instantanea.vehiculos.find((x) => x.placa === hecho.placaLeida);
    if (v !== undefined) {
      return { personaId: v.personaId, viviendaId: v.viviendaId, placaConocida: true };
    }
    // Placa ilegible o de un visitante sin vehículo registrado: el hecho sigue
    // adelante con lo que se sepa de la persona, si se sabe algo.
    return { personaId: hecho.personaId, viviendaId: null, placaConocida: false };
  }
  if (hecho.personaId !== null) {
    const a = instantanea.autorizaciones.find((x) => x.personaId === hecho.personaId);
    return {
      personaId: hecho.personaId,
      viviendaId: a?.viviendaId ?? null,
      placaConocida: false,
    };
  }
  return { personaId: null, viviendaId: null, placaConocida: false };
};

const autorizacionDesde = (a: AutorizacionEnCache, copropiedadId: string): Autorizacion | null => {
  const vigencia = Vigencia.crear(new Date(a.desde), new Date(a.hasta));
  if (esFallo(vigencia)) return null;

  let patron: PatronRecurrencia | null = null;
  if (a.patron !== null) {
    const p = PatronRecurrencia.crear({
      dias: [...a.patron.dias],
      minutoInicio: a.patron.minutoInicio,
      minutoFin: a.patron.minutoFin,
      desplazamientoUtcMinutos: a.patron.desplazamientoUtcMinutos,
    });
    // Un patrón corrupto NO se ignora dejando la autorización sin patrón: eso
    // la volvería permanente, que es abrir de más. La autorización entera se
    // descarta y el motor resuelve sin ella, que es cerrar de más (§2.1.4).
    if (esFallo(p)) return null;
    patron = p.valor;
  }

  // `rehidratar` y no `crear`: lo que está en la caché YA ocurrió y ya se
  // validó cuando ocurrió. `crear` la devolvería vigente aunque esté revocada.
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
  // Sin horario legible la zona se considera CERRADA, no abierta: §2.1.4.
  const dentroDeHorario = esFallo(horario) ? false : horario.valor.estaAbiertaEn(ahora);

  return {
    id: z.id,
    dentroDeHorario,
    aforoCompleto: z.aforoMaximo > 0 && z.ocupacionActual >= z.aforoMaximo,
    restringida: z.restringida,
  };
};

/**
 * Instantánea + hecho → `ContextoDeAcceso`. **El mismo tipo que usa la nube.**
 *
 * Devuelve `null` si la versión no es construible, que es el único caso en que
 * el Edge no puede ni siquiera armar el contexto. Lo resuelve la política de
 * contingencia, no este fichero.
 */
export const contextoDesde = (
  instantanea: InstantaneaDeReglas,
  hecho: HechoLocal,
  identidad: IdentidadResuelta,
): ContextoDeAcceso | null => {
  const version = VersionDeReglas.crear(instantanea.version, instantanea.copropiedadId);
  if (esFallo(version)) return null;

  const autorizaciones =
    identidad.personaId === null
      ? []
      : instantanea.autorizaciones
          .filter((a) => a.personaId === identidad.personaId)
          .map((a) => autorizacionDesde(a, instantanea.copropiedadId))
          .filter((a): a is Autorizacion => a !== null);

  const zonaEnCache =
    hecho.zonaId === null ? undefined : instantanea.zonas.find((z) => z.id === hecho.zonaId);

  return {
    ahora: hecho.ocurridoEn,
    copropiedadId: instantanea.copropiedadId,
    versionDeReglas: version.valor,
    personaId: identidad.personaId,
    viviendaId: identidad.viviendaId,
    metodo: hecho.metodo,
    autorizaciones,
    personasEnListaNegra: new Set(instantanea.personasEnListaNegra),
    placasEnListaNegra: new Set(instantanea.placasEnListaNegra),
    placaLeida: hecho.placaLeida,
    placaConocida: identidad.placaConocida,
    viviendaActiva:
      identidad.viviendaId !== null && instantanea.viviendasActivas.includes(identidad.viviendaId),
    zona:
      hecho.zonaId === null
        ? null
        : zonaEnCache === undefined
          ? // Una zona que la caché no conoce se trata como restringida y
            // cerrada. Es la dirección segura: lo contrario dejaría entrar a
            // una zona cuyo horario el Edge desconoce.
            { id: hecho.zonaId, dentroDeHorario: false, aforoCompleto: false, restringida: true }
          : zonaDesde(zonaEnCache, hecho.ocurridoEn),
    confianza: hecho.confianza,
    umbralDeConfianza: instantanea.umbralDeConfianza,
    consentimientoVigente:
      identidad.personaId !== null &&
      instantanea.personasConConsentimiento.includes(identidad.personaId),
  };
};
