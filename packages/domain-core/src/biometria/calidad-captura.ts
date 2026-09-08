import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Calidad de una captura facial — CA-08, HU-13, KPI-16.
 *
 * El documento pide validar «encuadre, nitidez, iluminación y rostro único»
 * **antes** de generar la plantilla. La razón no es estética: una captura mala
 * produce una plantilla que la terminal no reconocerá, y el visitante se
 * quedará en la puerta sin que nadie sepa por qué. Rechazar en la captura es
 * decirle en el momento qué corregir; aceptarla es aplazar el problema hasta
 * que ya no se puede corregir.
 *
 * Es una función pura sobre medidas que aporta quien captura —el móvil de la
 * ETAPA 11 o la consola de la 09—. El dominio no abre la cámara ni decodifica
 * un JPEG: recibe números y decide.
 */
export const MOTIVOS_RECHAZO = [
  'ENCUADRE',
  'NITIDEZ',
  'ILUMINACION',
  'ROSTROS_MULTIPLES',
  'SIN_ROSTRO',
] as const;
export type MotivoRechazoCaptura = (typeof MOTIVOS_RECHAZO)[number];

/**
 * Umbrales por defecto. Son `[SUPUESTO]` S-18: el documento exige validar la
 * calidad y no fija números. Se eligen conservadores —rechazar de más molesta;
 * aceptar de menos deja plantillas que no funcionan— y se pueden inyectar,
 * porque el equipo de captura de cada copropiedad no es el mismo.
 */
export interface UmbralesDeCalidad {
  readonly nitidezMinima: number;
  readonly iluminacionMinima: number;
  readonly iluminacionMaxima: number;
  readonly proporcionRostroMinima: number;
  readonly proporcionRostroMaxima: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesDeCalidad = Object.freeze({
  nitidezMinima: 0.6,
  iluminacionMinima: 0.25,
  iluminacionMaxima: 0.9,
  proporcionRostroMinima: 0.15,
  proporcionRostroMaxima: 0.8,
});

/** Medidas que aporta quien captura. Todas normalizadas a [0, 1]. */
export interface MedidasDeCaptura {
  readonly rostrosDetectados: number;
  readonly nitidez: number;
  readonly iluminacion: number;
  /** Fracción del encuadre que ocupa el rostro. */
  readonly proporcionRostro: number;
}

export type EvaluacionDeCaptura =
  | { readonly aceptada: true; readonly calidad: CalidadDeCaptura }
  | { readonly aceptada: false; readonly motivos: readonly MotivoRechazoCaptura[] };

const enRango = (v: number, min: number, max: number): boolean => v >= min && v <= max;

/**
 * Evalúa una captura. **Devuelve TODOS los motivos, no el primero.**
 *
 * Devolver solo el primero obligaría al visitante a repetir la foto una vez por
 * defecto: corrige la luz, y entonces le dicen que además está borrosa. Con la
 * lista completa corrige una vez.
 */
export const evaluarCaptura = (
  medidas: MedidasDeCaptura,
  umbrales: UmbralesDeCalidad = UMBRALES_POR_DEFECTO,
): EvaluacionDeCaptura => {
  const motivos: MotivoRechazoCaptura[] = [];

  if (medidas.rostrosDetectados === 0) motivos.push('SIN_ROSTRO');
  else if (medidas.rostrosDetectados > 1) motivos.push('ROSTROS_MULTIPLES');

  if (medidas.nitidez < umbrales.nitidezMinima) motivos.push('NITIDEZ');
  if (!enRango(medidas.iluminacion, umbrales.iluminacionMinima, umbrales.iluminacionMaxima))
    motivos.push('ILUMINACION');
  if (
    !enRango(
      medidas.proporcionRostro,
      umbrales.proporcionRostroMinima,
      umbrales.proporcionRostroMaxima,
    )
  )
    motivos.push('ENCUADRE');

  if (motivos.length > 0) return { aceptada: false, motivos: Object.freeze(motivos) };

  const calidad = CalidadDeCaptura.desdeMedidas(medidas);
  return { aceptada: true, calidad };
};

/**
 * Objeto de valor `CalidadDeCaptura`: la puntuación que se persiste junto a la
 * plantilla, en [0, 1] con tres decimales —el mismo `numeric(4,3)` de la tabla,
 * para que el dominio y el esquema no discrepen por redondeo—.
 */
export class CalidadDeCaptura {
  private constructor(readonly valor: number) {
    Object.freeze(this);
  }

  static crear(valor: number): Resultado<CalidadDeCaptura, ErrorDominio> {
    if (!Number.isFinite(valor) || valor < 0 || valor > 1) {
      return fallo(errorDominio('DATO_INVALIDO', 'La calidad de captura va de 0 a 1', 'CA-08'));
    }
    return exito(new CalidadDeCaptura(Math.round(valor * 1000) / 1000));
  }

  /**
   * La puntuación es la media de las tres medidas continuas. Deliberadamente
   * simple y documentada como tal: no hay en el documento una fórmula
   * comprometida, y una elaborada sin datos que la respalden sería precisión
   * fingida. Lo que decide el rechazo son los umbrales, no esta media.
   */
  static desdeMedidas(medidas: MedidasDeCaptura): CalidadDeCaptura {
    const media = (medidas.nitidez + medidas.iluminacion + medidas.proporcionRostro) / 3;
    return new CalidadDeCaptura(Math.round(Math.min(1, Math.max(0, media)) * 1000) / 1000);
  }
}
