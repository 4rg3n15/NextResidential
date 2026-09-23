/**
 * LOS TIPOS DEL CATÁLOGO DE RUTAS, en su propio módulo.
 *
 * Viven aparte desde la 15-C por una razón mecánica: el catálogo creció hasta
 * necesitar dos ficheros de datos —el original y el de la guía integral— y los
 * dos necesitan estos tipos. Dejarlos en uno de ellos habría creado una
 * importación circular entre dos ficheros que sólo son listas.
 */

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES GRADOS, NO DOS · añadido el 23/09/2026
 *
 * Hasta hoy una ruta era «verificada» —capturada del equipo— o «documentada»,
 * y ese segundo cajón mezclaba dos cosas muy distintas: lo que dice la guía
 * oficial del fabricante para ESTA familia de equipo, y lo que se dedujo de la
 * forma habitual de ISAPI. Tratarlas igual obliga a desconfiar de las dos por
 * igual, y entonces la etiqueta no informa de nada.
 *
 * | Grado           | Qué lo respalda                              | Qué falta          |
 * | --------------- | -------------------------------------------- | ------------------ |
 * | `verificada`    | Captura del equipo real                      | Nada               |
 * | `guia_oficial`  | La guía ANPR del fabricante                  | Verla en el equipo |
 * | `documentada`   | La forma habitual de ISAPI                   | Respaldo y equipo  |
 *
 * `guia_oficial` **no** es «verificada»: eso exige el aparato delante. Pero
 * tampoco es una deducción, y el guion de puesta en marcha las ordena por este
 * grado para que lo primero que se compruebe sea lo que menos respaldo tiene.
 */
export type Procedencia = 'verificada' | 'guia_oficial' | 'documentada';

export interface RutaDeEquipo {
  /** Nombre en lenguaje del dominio: es lo que se lee en un informe. */
  readonly proposito: string;
  readonly metodo: string;
  readonly ruta: string;
  readonly procedencia: Procedencia;
  /** Familia de equipo a la que aplica. */
  readonly familia: 'camara' | 'terminal' | 'videoportero' | 'comun';
  /** De dónde salió, literal. Una etiqueta sin procedencia no vale nada. */
  readonly fuente: string;
  /**
   * Sección de la guía ISAPI integral, cuando la procedencia es `guia_oficial`.
   *
   * **Ya es un número.** Hasta la 15-B decía de qué trataba —«control de la
   * barrera»— porque el destilado que respaldaba estas rutas llegó como texto
   * suelto. Con la guía integral delante, cada entrada cita su sección: es lo
   * que permite a quien está frente al equipo abrir el documento por la página
   * correcta en vez de buscar por palabras.
   *
   * Citar la sección **no asciende la ruta a VERIFICADA**. Eso sigue exigiendo
   * el aparato: la única verificada es la de la barrera.
   */
  readonly capitulo?: string;
  /**
   * Qué comprobar en sitio para ascenderla a VERIFICADA. Vacío en las que ya
   * lo están.
   */
  readonly confirmarEnSitio?: string;
  /**
   * El cuerpo de la petición, **cuando lo lleva**.
   *
   * Vive aquí y no en quien la invoca porque el cuerpo es vocabulario del
   * fabricante tanto como la ruta: nombres de elemento y de campo. KPI-11 lo
   * comprobó en cuanto el guion de puesta en marcha los escribió por su
   * cuenta, y tenía razón — el guion no tiene por qué saber cómo se llama el
   * campo de modo de una barrera.
   */
  readonly cuerpo?: { readonly tipo: string; readonly contenido: string };
  /** `true` si mueve algo físico. Quien la invoca decide si eso le conviene. */
  readonly acciona?: boolean;
  /**
   * `true` si CAMBIA el estado del equipo o se lo quita a otro: alta y
   * supresión de plantilla, y el canal de audio. No se sondean a ciegas.
   */
  readonly dejaRastro?: boolean;
}
