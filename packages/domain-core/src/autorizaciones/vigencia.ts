import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Objeto de valor `Vigencia` — un intervalo cerrado-abierto `[desde, hasta)`.
 *
 * La elección del intervalo NO es un detalle: con `[desde, hasta]` cerrado por
 * los dos lados, dos vigencias consecutivas se solapan en el instante de corte
 * y el mismo segundo pertenece a dos autorizaciones. Cerrado-abierto hace que
 * `hasta` de una sea exactamente `desde` de la siguiente sin ambigüedad, y
 * coincide con el `tstzrange` `[)` que usa la migración 0006 — dominio y base
 * no pueden discrepar sobre si un acceso llegó a tiempo.
 */
export class Vigencia {
  private constructor(
    readonly desde: Date,
    readonly hasta: Date,
  ) {}

  static crear(desde: Date, hasta: Date): Resultado<Vigencia, ErrorDominio> {
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return fallo(errorDominio('DATO_INVALIDO', 'Fecha de vigencia no válida', 'RN-01'));
    }
    if (hasta.getTime() <= desde.getTime()) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'La vigencia debe terminar después de empezar', 'RN-01'),
      );
    }
    return exito(new Vigencia(new Date(desde.getTime()), new Date(hasta.getTime())));
  }

  /** RN-01. El instante `hasta` ya está FUERA: es el borde de CA-04. */
  contiene(instante: Date): boolean {
    const t = instante.getTime();
    return t >= this.desde.getTime() && t < this.hasta.getTime();
  }

  expiradaEn(instante: Date): boolean {
    return instante.getTime() >= this.hasta.getTime();
  }

  aunNoEmpiezaEn(instante: Date): boolean {
    return instante.getTime() < this.desde.getTime();
  }
}
