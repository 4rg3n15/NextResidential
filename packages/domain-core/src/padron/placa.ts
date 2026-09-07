import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Objeto de valor `Placa` (§2.2).
 *
 * **Se normaliza al construirse**, y esa es toda su razón de ser. Una placa que
 * viaja como `string` por el sistema llega escrita de cinco formas distintas —
 * `abc-123`, `ABC 123`, `АВС123` con cirílicas homoglifas— y entonces el índice
 * único de la base deja de proteger nada: `abc123` y `ABC123` son dos filas
 * distintas para PostgreSQL y el mismo coche para el portero.
 *
 * Por eso el constructor es privado y la única entrada es `Placa.crear`, que
 * devuelve `Resultado`: una placa inválida es un fallo de negocio esperado, no
 * una excepción (§2.4). La forma normalizada es exactamente la que exige el
 * `CHECK` de la migración 0005, así que el dominio y la base no pueden
 * discrepar sobre qué es una placa.
 */
const LONGITUD_MINIMA = 5;
const LONGITUD_MAXIMA = 8;

export class Placa {
  private constructor(readonly valor: string) {}

  static crear(entrada: string): Resultado<Placa, ErrorDominio> {
    if (typeof entrada !== 'string') {
      return fallo(errorDominio('DATO_INVALIDO', 'La placa debe ser texto', 'RN-04'));
    }

    const normalizada = entrada
      // NFKC pliega variantes de ancho completo (`ＡＢＣ１２３`) a su forma ASCII.
      .normalize('NFKC')
      .toUpperCase()
      // Se eliminan separadores habituales, no cualquier carácter: si quedara
      // algo fuera de [A-Z0-9] debe FALLAR, no desaparecer en silencio. Borrar
      // lo desconocido convertiría `ABC-12Ω3` en una placa válida distinta.
      .replace(/[\s.\-_]/g, '');

    if (normalizada.length < LONGITUD_MINIMA || normalizada.length > LONGITUD_MAXIMA) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          `La placa debe tener entre ${LONGITUD_MINIMA} y ${LONGITUD_MAXIMA} caracteres tras normalizar`,
          'RN-04',
        ),
      );
    }
    if (!/^[A-Z0-9]+$/.test(normalizada)) {
      return fallo(errorDominio('DATO_INVALIDO', 'La placa solo admite letras y dígitos', 'RN-04'));
    }
    return exito(new Placa(normalizada));
  }

  /** Dos placas son iguales si su forma normalizada lo es. */
  equivale(otra: Placa): boolean {
    return this.valor === otra.valor;
  }

  toString(): string {
    return this.valor;
  }
}
