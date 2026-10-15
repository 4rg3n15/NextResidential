import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS 400 DE FORMA, EN ESPAÑOL Y POR CAMPO · RONDA 15-Z2 · DT-15W-05
 *
 * El `ValidationPipe` contestaba en inglés y con un arreglo de cadenas
 * («placa must be a string», «property x should not exist»): la app cubría en
 * el teléfono los casos que conocía y la consola pegaba las cadenas tal cual.
 * Aquí cada rechazo se traduce a `{ campo, motivo }` —la MISMA forma que los
 * 400 de regla del alta (`campos`, 15-W), que la app ya pinta bajo su campo— y
 * a un texto corto de persona. No sale nada interno: ni el nombre de la
 * restricción, ni el valor recibido, ni la clase del DTO.
 *
 * `message` conserva el resumen para quien sólo lee texto. Un campo anidado va
 * como «padre.hijo»; una lista, como «lista.2».
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CampoRechazado {
  readonly campo: string;
  readonly motivo: string;
}

export const RESUMEN_DE_FORMA = 'Revise los datos';
export const PROFUNDIDAD_MAXIMA = 6;

/** Clave de restricción de class-validator → motivo en español. */
const MOTIVOS: Readonly<Record<string, string>> = {
  whitelistValidation: 'no se admite este campo',
  isDefined: 'es obligatorio',
  isNotEmpty: 'es obligatorio',
  isString: 'debe ser texto',
  isNumber: 'debe ser un número',
  isInt: 'debe ser un número entero',
  isPositive: 'debe ser mayor que cero',
  isBoolean: 'debe ser verdadero o falso',
  isUuid: 'no es un identificador válido',
  isEmail: 'no es un correo válido',
  isUrl: 'no es una dirección válida',
  isIso8601: 'no es una fecha válida',
  isDateString: 'no es una fecha válida',
  isDate: 'no es una fecha válida',
  isIn: 'no es uno de los valores admitidos',
  isEnum: 'no es uno de los valores admitidos',
  isArray: 'debe ser una lista',
  arrayMinSize: 'tiene menos elementos de los necesarios',
  arrayMaxSize: 'tiene más elementos de los admitidos',
  arrayUnique: 'tiene elementos repetidos',
  minLength: 'es demasiado corto',
  maxLength: 'es demasiado largo',
  min: 'es menor que lo admitido',
  max: 'es mayor que lo admitido',
  matches: 'no tiene el formato esperado',
  isObject: 'debe ser un objeto',
  nestedValidation: 'no tiene la forma esperada',
  isOptional: 'no es válido',
};

/**
 * Los mensajes por omisión de class-validator son ingleses («placa must be a
 * string», «property x should not exist»): se traducen por su clave. Un DTO
 * que escribió su propio `message` —en español, con el caso concreto («debe
 * aceptar la política del rostro»)— ya dijo lo que había que decir: se respeta.
 */
const ES_MENSAJE_POR_OMISION = /\b(must|should|cannot|each value)\b/;
const motivoDe = (clave: string, mensaje: string | undefined): string =>
  mensaje !== undefined && mensaje !== '' && !ES_MENSAJE_POR_OMISION.test(mensaje)
    ? mensaje
    : (MOTIVOS[clave] ?? 'no es válido');

/** Recorre el árbol de errores con profundidad acotada (§2.4): nunca sobre entrada sin tope. */
const aplanar = (
  errores: readonly ValidationError[],
  prefijo: string,
  profundidad: number,
  salida: CampoRechazado[],
): void => {
  if (profundidad > PROFUNDIDAD_MAXIMA) return;
  for (const e of errores) {
    const campo = prefijo === '' ? e.property : `${prefijo}.${e.property}`;
    const claves = Object.keys(e.constraints ?? {});
    const primera = claves[0];
    if (primera !== undefined) {
      // Un solo motivo por campo: el primero que class-validator anotó. Más de
      // uno sobre el mismo campo confunde («es obligatorio» y «debe ser texto»).
      salida.push({ campo, motivo: motivoDe(primera, e.constraints?.[primera]) });
    }
    if (e.children !== undefined && e.children.length > 0) {
      aplanar(e.children, campo, profundidad + 1, salida);
    }
  }
};

export const camposRechazados = (
  errores: readonly ValidationError[],
): readonly CampoRechazado[] => {
  const salida: CampoRechazado[] = [];
  aplanar(errores, '', 0, salida);
  return salida;
};

/** La `exceptionFactory` del `ValidationPipe` global (`seguridad.ts`). */
export const rechazoDeForma = (errores: ValidationError[]): BadRequestException => {
  const campos = camposRechazados(errores);
  const resumen =
    campos.length === 0
      ? RESUMEN_DE_FORMA
      : `${RESUMEN_DE_FORMA}: ${campos.map((c) => `${c.campo} ${c.motivo}`).join('; ')}`;
  return new BadRequestException({ message: resumen, campos: [...campos] });
};
