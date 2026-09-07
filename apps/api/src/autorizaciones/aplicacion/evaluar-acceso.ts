import { evaluarAcceso } from '@ncr/domain-core';
import type { Politica, Reloj, ResultadoAcceso } from '@ncr/domain-core';
import type { CargadorDeContexto, SolicitudDeAcceso } from './puertos';

/**
 * Caso de uso `DecidirAcceso`.
 *
 * Hace **todo el I/O antes** de evaluar y ninguno después. Es la frontera que
 * mantiene puro al motor: si esta clase pasara el repositorio al motor «para
 * que consulte lo que le falte», el dominio tendría infraestructura y dejaría
 * de poder ejecutarse idéntico en el Edge (RN-16, ETAPA 12).
 *
 * No persiste el evento: eso es de la ETAPA 06, que es dueña del agregado
 * `Acceso`. Aquí se decide; allí se deja constancia.
 */
export class DecidirAcceso {
  constructor(
    private readonly cargador: CargadorDeContexto,
    private readonly reloj: Reloj,
    /** Inyectables para poder probar con conjuntos reducidos y para el Edge. */
    private readonly reglas?: readonly Politica[],
  ) {}

  async ejecutar(solicitud: SolicitudDeAcceso): Promise<ResultadoAcceso> {
    const ahora = this.reloj.ahora();
    const contexto = await this.cargador.cargar(solicitud, ahora);
    return this.reglas === undefined
      ? evaluarAcceso(contexto)
      : evaluarAcceso(contexto, this.reglas);
  }
}
