import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Identidad de una persona — objetos de valor `Documento` y `NombreDePersona`.
 *
 * **Por qué la identidad es un objeto de valor y no un `string` con un UUID.**
 * La tabla `personas` existe (D-01) para que la lista negra alcance a la misma
 * persona se presente como visitante, acompañante o residente (RN-06). Esa
 * garantía descansa entera sobre el índice único `(copropiedad, tipo, número)`,
 * y un índice único solo protege si todos los caminos escriben la MISMA forma:
 * `12.345.678`, `12345678` y `12 345 678` son tres filas para PostgreSQL y una
 * sola persona para el portero. Es exactamente el argumento de `Placa`, y por
 * eso la normalización vive aquí y no en cada formulario.
 *
 * **Consecuencia de interfaz, y es la que motivó este archivo (D-72).** Si el
 * sistema sabe resolver la identidad desde el documento, la consola no tiene
 * ninguna razón para pedir un identificador interno: pide nombre y documento,
 * que es lo que quien autoriza tiene a mano.
 */
export type TipoDeDocumento = 'cedula' | 'cedula_extranjeria' | 'pasaporte' | 'nit' | 'otro';

/** El mismo catálogo del enumerado `tipo_documento` de la migración `0002`. */
export const TIPOS_DE_DOCUMENTO: readonly TipoDeDocumento[] = [
  'cedula',
  'cedula_extranjeria',
  'pasaporte',
  'nit',
  'otro',
];

const esTipoDeDocumento = (v: unknown): v is TipoDeDocumento =>
  typeof v === 'string' && (TIPOS_DE_DOCUMENTO as readonly string[]).includes(v);

const LONGITUD_MINIMA_DOCUMENTO = 4;
const LONGITUD_MAXIMA_DOCUMENTO = 20;
const LONGITUD_MINIMA_NOMBRE = 2;
const LONGITUD_MAXIMA_NOMBRE = 200;

/**
 * Sustituye los caracteres de control por un espacio.
 *
 * Se filtra por punto de código y no con una expresión regular, igual que en
 * `eventos/presentacion/formatos.ts`: una regex con controles literales dispara
 * `no-control-regex`, y desactivar la regla apagaría un aviso útil en todo el
 * resto del árbol.
 */
const sinControl = (valor: string): string =>
  [...valor]
    .map((caracter) => {
      const codigo = caracter.codePointAt(0) ?? 0;
      return codigo < 0x20 || codigo === 0x7f ? ' ' : caracter;
    })
    .join('');

export class Documento {
  private constructor(
    readonly tipo: TipoDeDocumento,
    /** Forma normalizada: la única que llega a la base. */
    readonly numero: string,
  ) {}

  /**
   * Forma normalizada de un número, o `null` si el texto no puede serlo.
   *
   * Es pública porque el BUSCADOR la necesita: quien teclea `12.345.678` debe
   * encontrar a quien está guardado como `12345678`, y la única forma de que la
   * consulta y la escritura no se separen es que las dos pasen por aquí.
   */
  static normalizarNumero(numero: unknown): string | null {
    if (typeof numero !== 'string') return null;
    const normalizado = numero
      // NFKC pliega los dígitos de ancho completo a ASCII, igual que en `Placa`.
      .normalize('NFKC')
      .toUpperCase()
      // Se eliminan los separadores con los que se escribe una cédula en
      // Colombia —`12.345.678`, `12 345 678`— y nada más: lo que quede fuera de
      // [A-Z0-9] debe FALLAR, no desaparecer. Borrar lo desconocido convertiría
      // dos documentos distintos en el mismo, que es la fuga que RN-06 no
      // admite.
      .replace(/[\s.\-_]/g, '');
    return /^[A-Z0-9]+$/.test(normalizado) ? normalizado : null;
  }

  static crear(tipo: unknown, numero: unknown): Resultado<Documento, ErrorDominio> {
    if (!esTipoDeDocumento(tipo)) {
      return fallo(errorDominio('DATO_INVALIDO', 'Tipo de documento no reconocido', 'RN-06'));
    }
    if (typeof numero !== 'string') {
      return fallo(errorDominio('DATO_INVALIDO', 'El número de documento debe ser texto', 'RN-06'));
    }
    const normalizado = Documento.normalizarNumero(numero);
    if (normalizado === null) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'El documento solo admite letras y dígitos', 'RN-06'),
      );
    }

    if (
      normalizado.length < LONGITUD_MINIMA_DOCUMENTO ||
      normalizado.length > LONGITUD_MAXIMA_DOCUMENTO
    ) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          `El documento debe tener entre ${LONGITUD_MINIMA_DOCUMENTO} y ${LONGITUD_MAXIMA_DOCUMENTO} caracteres tras normalizar`,
          'RN-06',
        ),
      );
    }
    return exito(new Documento(tipo, normalizado));
  }

  equivale(otro: Documento): boolean {
    return this.tipo === otro.tipo && this.numero === otro.numero;
  }

  toString(): string {
    return `${this.tipo}:${this.numero}`;
  }
}

export class NombreDePersona {
  private constructor(readonly valor: string) {}

  static crear(entrada: unknown): Resultado<NombreDePersona, ErrorDominio> {
    if (typeof entrada !== 'string') {
      return fallo(errorDominio('DATO_INVALIDO', 'El nombre debe ser texto', 'D-01'));
    }
    // NFC —no NFKC— porque en un nombre la tilde ES el dato: `José` no se
    // pliega a `Jose`. Lo que se unifica es la representación de la tilde, para
    // que dos formas Unicode del mismo nombre no ordenen distinto.
    //
    // §2.7.4 · los caracteres de control se sustituyen ANTES de persistir. El
    // `CHECK` de la migración 0005 los rechaza, y llegar hasta él produciría un
    // 500 opaco en vez de un motivo.
    const normalizado = sinControl(entrada.normalize('NFC')).replace(/\s+/g, ' ').trim();

    if (normalizado.length < LONGITUD_MINIMA_NOMBRE) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'El nombre necesita al menos dos caracteres', 'D-01'),
      );
    }
    if (normalizado.length > LONGITUD_MAXIMA_NOMBRE) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          `El nombre no puede pasar de ${LONGITUD_MAXIMA_NOMBRE} caracteres`,
          'D-01',
        ),
      );
    }
    return exito(new NombreDePersona(normalizado));
  }

  toString(): string {
    return this.valor;
  }
}
