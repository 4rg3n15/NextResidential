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
import type { MetodoDeAcceso } from '@ncr/domain-core';

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
  /** 15-Q · la placa de la autorización de visitante: la nube la reconoce por aquí. */
  readonly placa?: string | null;
}

export interface VehiculoEnCache {
  /** Ya normalizada por la nube; el Edge no reinventa la normalización. */
  readonly placa: string;
  readonly personaId: string;
  readonly viviendaId: string;
  /** 15-Q · el derecho del residente es `residente:<vehiculoId>` (S-33). */
  readonly vehiculoId?: string;
}

export interface ZonaEnCache {
  readonly id: string;
  readonly restringida: boolean;
  /** 15-Q · cerrada por el operador o de baja: no abre por horario. */
  readonly abierta?: boolean;
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
  /** 15-Q · la plantilla que una terminal reconoce: id y titular, NUNCA el vector. */
  readonly plantillas?: readonly {
    readonly plantillaId: string;
    readonly personaId: string;
    readonly reconocibleHasta: string | null;
  }[];
  /** 15-Q · SHA-256 del contenido, el de `versiones_de_reglas` (0010). */
  readonly hash?: string;
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
  // 15-Q · las plantillas son opcionales (instantáneas anteriores), pero si
  // vienen tienen que ser una lista: lo contrario tumbaría el contexto facial.
  if (i.plantillas !== undefined && !Array.isArray(i.plantillas)) return false;
  return colecciones.every((c) => Array.isArray(i[c]));
};

/**
 * 15-Q · «sin cambios»: la nube da fe, en `generadaEn`, de que `version` sigue
 * siendo la vigente. KPI-31 se mide desde ahí, no desde la descarga.
 */
export interface ReglasVigentes {
  readonly sinCambios: true;
  readonly version: number;
  readonly generadaEn: string;
}

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

// 15-Q · el contexto se arma en `contexto-local.ts`, con la semántica de la nube.
export { contextoDesde, resolverIdentidad } from './contexto-local';
