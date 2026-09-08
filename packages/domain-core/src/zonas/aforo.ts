import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Objeto de valor `Aforo` — RN-14, CA-14.
 *
 * **Este objeto EXPRESA la invariante; no es quien la garantiza.**
 *
 * La distinción no es una sutileza: bajo concurrencia, dos peticiones que leen
 * el mismo `Aforo`, cada una comprueba «cabe uno más» y cada una devuelve un
 * `Aforo` incrementado producen dos entradas con una sola plaza. Es exactamente
 * el fallo que ADR-04 obliga a resolver en la base, y el mismo que KPI-03 mide
 * para las placas.
 *
 * La garantía real son dos cosas de PostgreSQL, y viven en la migración 0007:
 *
 * 1. `CHECK (conteo_actual <= aforo_maximo)`, que hace la violación
 *    **estructuralmente imposible**, venga de donde venga la escritura.
 * 2. El incremento atómico sin `SELECT` previo:
 *    `UPDATE … SET conteo_actual = conteo_actual + 1 WHERE … AND conteo_actual < aforo_maximo`
 *    — **cero filas devueltas es el aforo superado**, sin ventana de carrera.
 *
 * Lo que este objeto de valor aporta es que el caso de uso y las pruebas de
 * dominio puedan razonar sobre el aforo sin base de datos, y que el motor de
 * reglas reciba un `aforoCompleto` calculado por el dominio y no por un `if`
 * suelto en un adaptador.
 */
export class Aforo {
  private constructor(
    readonly maximo: number,
    readonly actual: number,
  ) {
    Object.freeze(this);
  }

  static crear(maximo: number, actual = 0): Resultado<Aforo, ErrorDominio> {
    if (!Number.isInteger(maximo) || maximo < 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El aforo máximo es un entero ≥ 0', 'RN-14'));
    }
    if (!Number.isInteger(actual) || actual < 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El conteo actual es un entero ≥ 0', 'RN-14'));
    }
    if (actual > maximo) {
      // Llegar aquí significa que alguien construyó un aforo ya violado —una
      // fila corrupta, una migración a medias—. Se rechaza al construir en vez
      // de arrastrarlo: un agregado inválido contamina todo lo que decida.
      return fallo(
        errorDominio('INVARIANTE_VIOLADA', 'El conteo no puede superar el aforo máximo', 'RN-14'),
      );
    }
    return exito(new Aforo(maximo, actual));
  }

  /** Devuelve el aforo con una plaza más, o `AFORO_SUPERADO` si no cabe. */
  ocupar(): Resultado<Aforo, ErrorDominio> {
    if (this.completo) {
      return fallo(errorDominio('INVARIANTE_VIOLADA', 'Aforo superado', 'RN-14'));
    }
    return exito(new Aforo(this.maximo, this.actual + 1));
  }

  /**
   * Libera una plaza. **Nunca baja de cero**, y ese suelo no es defensivo por
   * costumbre: CU-05 excepción 6a describe el caso real de una salida que se
   * registra sin que se registrara la entrada —un sensor que falló—. Un
   * contador negativo daría plazas de más durante el resto de la jornada.
   */
  liberar(): Aforo {
    return this.actual === 0 ? this : new Aforo(this.maximo, this.actual - 1);
  }

  /** Reinicio del contador (CU-05 6a, P-04). Ver `politica-reinicio.ts`. */
  reiniciar(): Aforo {
    return this.actual === 0 ? this : new Aforo(this.maximo, 0);
  }

  get completo(): boolean {
    return this.actual >= this.maximo;
  }

  get disponible(): number {
    return this.maximo - this.actual;
  }
}
