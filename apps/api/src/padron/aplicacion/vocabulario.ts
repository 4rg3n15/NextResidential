/**
 * Cómo se llaman aquí una vivienda y una agrupación, y de qué tipo es el
 * conjunto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN PUERTO DEL PADRÓN Y NO UNA LECTURA DE `copropiedades`
 *
 * §2.2: ningún módulo consulta las tablas de otro. El padrón necesita tres
 * datos que son de `Copropiedad`, así que declara el puerto mínimo que le hace
 * falta y el cableado lo cumple con el repositorio de `multiempresa`. Si el
 * padrón leyera esa tabla, la frontera existiría en el documento y no en el
 * código.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÓNDE SE LEE `tipo`, Y DÓNDE NO
 *
 * Se lee **solo** para elegir el formulario de generación. No lo consulta el
 * motor de reglas, no lo guarda ninguna vivienda y no entra en ninguna
 * decisión de acceso. Esa es la condición que hace segura la respuesta a «¿se
 * puede cambiar el tipo después?»: sí, y las viviendas ya creadas no se
 * enteran. El analizador de fronteras lo vigila (`scripts/lib/frontera-*`).
 */
import type { ContextoTenant } from '../../autenticacion';

export type TipoDeCopropiedad = 'apartamentos' | 'casas' | 'fincas' | 'otro';

export interface VocabularioDeCopropiedad {
  /** `null` = sin configurar. Es lo que dispara el diálogo inicial. */
  readonly tipo: TipoDeCopropiedad | null;
  readonly etiquetaVivienda: string;
  readonly etiquetaAgrupacion: string;
}

export interface LectorDeVocabulario {
  /**
   * `null` si la copropiedad no existe o queda fuera del alcance. Recibe el
   * contexto porque el alcance se comprueba por los DOS caminos de §2.7.6, y
   * un puerto que no lo pidiera obligaría al adaptador a saltarse uno.
   */
  leer(ctx: ContextoTenant, copropiedadId: string): Promise<VocabularioDeCopropiedad | null>;
}

export const LECTOR_DE_VOCABULARIO = Symbol.for('ncr.puerto.LectorDeVocabulario');

/**
 * Valor conservador cuando la copropiedad todavía no tiene vocabulario. No
 * inventa «Casa» ni «Torre»: sin configurar, el conjunto no ha dicho cómo
 * llama a nada, y adivinarlo pondría una palabra falsa en cada pantalla.
 */
export const VOCABULARIO_SIN_CONFIGURAR: VocabularioDeCopropiedad = {
  tipo: null,
  etiquetaVivienda: 'Vivienda',
  etiquetaAgrupacion: 'Torre o bloque',
};
