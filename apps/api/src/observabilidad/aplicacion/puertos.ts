import type { ClaveKpi, DefinicionKpi } from './kpis';
import type { ResumenDeMuestras } from './percentiles';

/**
 * Puertos de observabilidad. Los declara la aplicación; los implementa la
 * infraestructura (§2.2, DIP). El caso de uso que mide una latencia no sabe si
 * detrás hay un anillo en memoria, Prometheus o nada.
 */

export const METRICAS = Symbol.for('ncr.puerto.Metricas');

export interface FilaDeLatencia extends ResumenDeMuestras {
  readonly definicion: DefinicionKpi;
  /** Muestras por encima del umbral desde el arranque. NO se pierde con el anillo. */
  readonly incumplimientos: number;
  /** Total observado desde el arranque, aunque el anillo solo guarde las últimas. */
  readonly observadas: number;
  readonly cumple: boolean | null;
}

export interface ResumenDeLatencias {
  readonly desde: string;
  readonly ventana: number;
  readonly filas: readonly FilaDeLatencia[];
}

export interface Metricas {
  observar(kpi: ClaveKpi, milisegundos: number): void;
  resumen(): ResumenDeLatencias;
}

export const REPORTE_DE_ERRORES = Symbol.for('ncr.puerto.ReporteDeErrores');

/**
 * Captura de errores hacia el agregador (Sentry, §2.6).
 *
 * **No devuelve nada y no puede lanzar.** Un fallo al reportar un fallo no
 * puede convertirse en un segundo fallo: el manejador global de excepciones lo
 * llama mientras ya está atendiendo un 500, y una excepción ahí dejaría al
 * cliente sin respuesta por culpa del observador.
 */
export interface ReporteDeErrores {
  capturar(error: unknown, contexto?: Readonly<Record<string, unknown>>): void;
}
