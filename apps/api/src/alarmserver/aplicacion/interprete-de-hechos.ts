import type { EventoDeEquipo } from '@ncr/providers';

/**
 * 15-Q · CÓMO SE NOMBRA UN HECHO DE EQUIPO, COMO PUERTO
 *
 * La referencia de una lectura o de un rostro es la mitad de la clave de
 * idempotencia: la nube y el Edge tienen que calcular LA MISMA para el mismo
 * paso, o la reconciliación duplica accesos (RN-17, CA-22). Por eso hay una
 * sola implementación, en `@ncr/providers` (`equipo/hecho-de-acceso.ts`).
 *
 * La capa de aplicación no la importa como valor (O2, `frontera-extensibilidad`):
 * la recibe por inyección. La implementación vive en
 * `../infraestructura/interprete-de-hechos.ts`, y la compone el módulo.
 */
export interface InterpreteDeHechos {
  referenciaDePlaca(evento: EventoDeEquipo): string;
  referenciaDeRostro(evento: EventoDeEquipo): string;
  /** [SUPUESTO] S-40 · la confianza de un rostro que la terminal ya reconoció. */
  readonly confianzaDeRostroReconocido: number;
}
