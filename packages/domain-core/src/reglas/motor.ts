import type { ContextoDeAcceso } from './contexto';
import type { ResultadoAcceso } from './resultado-acceso';
import { negar, permitir } from './resultado-acceso';
import type { Politica } from './politicas';
import {
  lecturaDudosa,
  politicaConfianza,
  politicaConsentimiento,
  politicaListaNegra,
  politicaPlacaConocida,
  politicaRecurrencia,
  politicaVigencia,
  politicaVivienda,
  politicaZona,
} from './politicas';

/**
 * Orden **vinculante** del diagrama arquitectónico (pág. 3):
 * `listaNegra > vigencia > patrón > zona`.
 *
 * El orden no es una optimización: determina el motivo que queda registrado.
 * Un visitante en lista negra **con autorización vigente** produce
 * `LISTA_NEGRA` y no `VIGENCIA_EXPIRADA` (CA-13), y eso solo es cierto si la
 * lista se evalúa primero.
 *
 * Las políticas que el diagrama no ordena se intercalan donde su motivo tiene
 * sentido: una lectura inservible se rechaza **antes** de mirar vigencias,
 * porque con una placa ilegible no sabemos de quién son las vigencias que
 * estaríamos mirando.
 */
export const REGLAS_PREDETERMINADAS: readonly Politica[] = [
  politicaListaNegra,
  politicaVivienda,
  politicaConfianza,
  politicaConsentimiento,
  politicaPlacaConocida,
  politicaVigencia,
  politicaRecurrencia,
  politicaZona,
];

/**
 * El motor de reglas: `(contexto, reglas) => ResultadoAcceso`.
 *
 * **Función pura.** Cero I/O, cero `new Date()`, cero dependencias de NestJS o
 * Supabase. El instante viaja en el contexto (`ahora`) y las reglas entran por
 * parámetro, así que la misma entrada produce siempre la misma salida. De eso
 * depende que la ETAPA 12 pueda ejecutar este mismo código en el Edge y
 * demostrar que decidió igual que la nube (RN-16, CA-21).
 *
 * Recorre las políticas en orden y **la primera que niega determina el
 * resultado**. Las que se pronuncian a favor no cortan el recorrido: un
 * permiso temprano dejaría sin evaluar a las que faltan, que es exactamente el
 * fallo que la precedencia existe para impedir.
 */
export const evaluarAcceso = (
  contexto: ContextoDeAcceso,
  reglas: readonly Politica[] = REGLAS_PREDETERMINADAS,
): ResultadoAcceso => {
  // RN-15 · Frontera del tenant. Una versión de reglas de otra copropiedad
  // significa que el contexto se armó mal; se deniega, no se «intenta igual».
  if (contexto.versionDeReglas.copropiedadId !== contexto.copropiedadId) {
    return negar('FALLO_TECNICO', contexto.versionDeReglas, 'motor.copropiedadIncoherente');
  }

  // §2.1.4 · Comportamiento conservador: denegar por defecto. Un conjunto de
  // reglas vacío no es «todo permitido», es un despliegue incompleto — y en el
  // Edge, una caché que no llegó (KPI-31).
  if (reglas.length === 0) {
    return negar('FALLO_TECNICO', contexto.versionDeReglas, 'motor.sinReglas');
  }

  for (const politica of reglas) {
    const resultado = politica(contexto);
    if (resultado !== null && !resultado.permitido) return resultado;
  }

  return permitir(contexto.versionDeReglas, 'motor.ningunaRegulaNiega', lecturaDudosa(contexto));
};
