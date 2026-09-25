/**
 * EL VEREDICTO QUE LA PLATAFORMA DEVUELVE A UNA TERMINAL QUE ESPERA · A2.
 *
 * Es el corazón de «Next Control decide, el hardware ejecuta» en la terminal
 * facial: el equipo reconoce, REPORTA y se queda esperando; el motor decide; y
 * esto es lo que se le contesta para que abra o niegue. No es un puerto del
 * dominio —el motor no sabe que alguien espera— y vive en el núcleo neutral
 * del paquete para que cualquier adaptador lo cumpla con la misma forma.
 */
export interface VeredictoRemoto {
  /**
   * El número con el que el equipo identificó SU petición pendiente. Sin él
   * el aparato no sabe a qué reconocimiento corresponde la respuesta. `null`
   * cuando el evento no lo trajo: el adaptador decide si aun así contesta.
   */
  readonly serie: number | null;
  readonly permitido: boolean;
  /** Para el registro del equipo, en lenguaje del operador. */
  readonly motivo: string;
}
