/**
 * Puertos del Edge. El dominio declara, la infraestructura cumple (§2.2, DIP).
 *
 * Ninguno de estos nombres sabe qué es SQLite, ni HTTP, ni `fetch`. Es la misma
 * disciplina de la API y aquí tiene una consecuencia práctica añadida: las
 * pruebas de los 30 minutos sin WAN y de las 24 horas de autonomía se ejecutan
 * **en memoria y en milisegundos** porque el reloj, el enlace y la nube son
 * puertos. Con un `fetch` dentro, esa prueba duraría 24 horas y nadie la
 * correría.
 */
import type { ResultadoAcceso } from '@ncr/domain-core';
import type { InstantaneaDeReglas } from './instantanea-de-reglas';

/** La caché versionada, tal como la ve la aplicación. */
export interface CacheDeReglas {
  /** La instantánea vigente de esta copropiedad, o `null` si no hay ninguna. */
  vigente(copropiedadId: string): InstantaneaDeReglas | null;
  /**
   * Guarda una instantánea nueva. **Rechaza una versión anterior o igual**: la
   * versión es monótona por copropiedad (migración 0010) y aceptar una vieja
   * haría que el Edge retrocediera de reglas sin que nadie lo notara.
   */
  guardar(instantanea: InstantaneaDeReglas): boolean;
}

/** Un envío pendiente. Es la misma mecánica que la bandeja de la app (RN-17). */
export interface EnvioPendiente {
  readonly claveIdempotencia: string;
  /** Orden de llegada. La reconciliación respeta este orden (CA-22). */
  readonly secuencia: number;
  readonly cuerpo: string;
  readonly encoladoEn: string;
  readonly intentos: number;
  readonly proximoIntentoEn: string | null;
  readonly ultimoError: string | null;
}

export interface BandejaDeSalida {
  /** Idempotente: la misma clave dos veces deja UNA fila (RN-17). */
  encolar(clave: string, cuerpo: string, encoladoEn: Date): void;
  /** En ORDEN de secuencia y solo los que ya toca reintentar. */
  pendientes(ahora: Date, limite: number): readonly EnvioPendiente[];
  /** La nube lo confirmó —creado o duplicado—: sale de la bandeja. */
  confirmar(clave: string): void;
  fallo(clave: string, error: string, proximoIntentoEn: Date): void;
  cuantosPendientes(): number;
  /** CA-22 · el último que la nube confirmó, para reanudar donde se quedó. */
  ultimaSecuenciaConfirmada(): number;
}

/** Sonda del enlace. Una llamada barata que dice si hay WAN ahora mismo. */
export interface SondaDeEnlace {
  hayEnlace(): Promise<boolean>;
}

export interface ResultadoDeEnvio {
  readonly claveIdempotencia: string;
  readonly aceptado: boolean;
  /** `true` si la nube ya lo tenía. NO es un error: es CA-22 funcionando. */
  readonly duplicado: boolean;
  readonly detalle?: string;
}

export interface ClienteDeNube {
  /** Envía un lote EN ORDEN y devuelve un resultado por clave. */
  reconciliar(lote: readonly EnvioPendiente[]): Promise<readonly ResultadoDeEnvio[]>;
  /** Pide la instantánea más reciente. `null` si no hay una más nueva. */
  descargarReglas(copropiedadId: string, versionActual: number): Promise<InstantaneaDeReglas | null>;
}

/** Lo que el Edge decidió, listo para viajar. */
export interface DecisionLocal {
  readonly claveIdempotencia: string;
  readonly resultado: ResultadoAcceso;
  /** KPI-31 · decidido con una caché que pudo haber envejecido. */
  readonly cachePotencialmenteObsoleto: boolean;
  /** `true` si se resolvió por contingencia y no por el motor (CU-04 3a). */
  readonly porContingencia: boolean;
  /** `escalar`: hay que avisar al portero, la puerta no se abre sola. */
  readonly requiereEscalamiento: boolean;
}
