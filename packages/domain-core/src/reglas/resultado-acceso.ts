import type { MotivoAcceso } from '../compartido/errores';
import type { VersionDeReglas } from '../autorizaciones/version-de-reglas';

/**
 * Objeto de valor `ResultadoAcceso` — la salida del motor de reglas.
 *
 * Es una unión discriminada y no un booleano con un motivo opcional: un
 * `{ permitido: false }` sin motivo no compilaría, y CA-16 exige que toda
 * negación tenga uno. El tipo hace imposible el caso que la regla prohíbe.
 *
 * `versionDeReglas` va en AMBAS ramas porque una concesión también hay que
 * poder auditarla: la pregunta «¿con qué reglas se abrió esta puerta?» es tan
 * legítima como «¿por qué se negó?» (RN-16, ETAPA 12).
 */
export type ResultadoAcceso =
  | {
      readonly permitido: true;
      readonly versionDeReglas: VersionDeReglas;
      readonly reglaAplicada: string;
      /** Baja confianza en la lectura: se permite, pero se marca (CU-01, 3a). */
      readonly requiereConfirmacionHumana?: boolean;
    }
  | {
      readonly permitido: false;
      readonly motivo: MotivoAcceso;
      readonly versionDeReglas: VersionDeReglas;
      readonly reglaAplicada: string;
    };

export const permitir = (
  versionDeReglas: VersionDeReglas,
  reglaAplicada: string,
  requiereConfirmacionHumana = false,
): ResultadoAcceso =>
  requiereConfirmacionHumana
    ? { permitido: true, versionDeReglas, reglaAplicada, requiereConfirmacionHumana: true }
    : { permitido: true, versionDeReglas, reglaAplicada };

export const negar = (
  motivo: MotivoAcceso,
  versionDeReglas: VersionDeReglas,
  reglaAplicada: string,
): ResultadoAcceso => ({ permitido: false, motivo, versionDeReglas, reglaAplicada });
