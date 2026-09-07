import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Objeto de valor `VersiónDeReglas`.
 *
 * Cada decisión sella la versión con la que se tomó, y de eso depende que el
 * Edge sea auditable en la ETAPA 12: cuando un gateway decide con su caché
 * durante un corte de WAN, lo único que permite explicar después por qué
 * decidió así es saber QUÉ reglas tenía. Sin este sello, un acceso concedido
 * offline es indistinguible de un error.
 */
export class VersionDeReglas {
  private constructor(
    readonly numero: number,
    readonly copropiedadId: string,
  ) {}

  static crear(numero: number, copropiedadId: string): Resultado<VersionDeReglas, ErrorDominio> {
    if (!Number.isInteger(numero) || numero < 1) {
      return fallo(errorDominio('DATO_INVALIDO', 'La versión de reglas es un entero ≥ 1'));
    }
    if (!copropiedadId) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'La versión pertenece a una copropiedad', 'RN-15'),
      );
    }
    return exito(new VersionDeReglas(numero, copropiedadId));
  }

  /** Monótona por copropiedad (migración 0010, `tg_version_reglas_monotona`). */
  esPosteriorA(otra: VersionDeReglas): boolean {
    return this.copropiedadId === otra.copropiedadId && this.numero > otra.numero;
  }

  toString(): string {
    return `v${this.numero}`;
  }
}
