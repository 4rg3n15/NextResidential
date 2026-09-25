import { exito, fallo } from '@ncr/domain-core';
import type { Resultado } from '@ncr/domain-core';

/**
 * NOMBRE DE USUARIO · objeto de valor (ADR-023).
 *
 * Se normaliza al construir, igual que `Placa` (§2.4): quitar lo invisible,
 * NFC, recortar y pasar a minúsculas. El juego de caracteres es cerrado a
 * propósito —`a-z`, `0-9`, punto, guion y guion bajo— porque el nombre acaba
 * dentro de un identificador técnico que no se muestra nunca (el correo
 * sintético) y porque un portero lo teclea en una garita: sin tildes que se
 * confundan ni homógrafos que se parezcan.
 *
 * La base lo repite con el mismo patrón (`usuarios_nombre_usuario_formato`,
 * migración 0037) y compara sin distinguir mayúsculas (`citext`): el objeto de
 * valor valida la forma y la base garantiza la unicidad por copropiedad.
 */
export type NombreDeUsuario = string & { readonly __marca: 'NombreDeUsuario' };

export const USUARIO_MINIMO = 3;
export const USUARIO_MAXIMO = 32;
const FORMATO = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const INVISIBLES =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export const nombreDeUsuario = (bruto: string): Resultado<NombreDeUsuario, string> => {
  const limpio = bruto.replace(INVISIBLES, '').normalize('NFC').trim().toLowerCase();
  if (limpio.length < USUARIO_MINIMO || limpio.length > USUARIO_MAXIMO) {
    return fallo(`El usuario tiene entre ${USUARIO_MINIMO} y ${USUARIO_MAXIMO} caracteres`);
  }
  if (!FORMATO.test(limpio)) {
    return fallo(
      'El usuario admite letras sin tilde, números, punto, guion y guion bajo, y empieza por letra o número',
    );
  }
  return exito(limpio as NombreDeUsuario);
};

/**
 * NIT tal como lo guarda la base (`app.normalizar_nit`, 0026): sin espacios,
 * puntos ni comas, y con el guion del dígito de verificación. Es la otra mitad
 * del identificador de acceso (C-34): el usuario es único DENTRO de una
 * copropiedad, así que sin el NIT el nombre solo sería ambiguo.
 */
export type Nit = string & { readonly __marca: 'Nit' };
const FORMATO_NIT = /^[0-9]{5,15}(-[0-9])?$/;

export const nit = (bruto: string): Resultado<Nit, string> => {
  const limpio = bruto.replace(/[\s.,]/g, '');
  return FORMATO_NIT.test(limpio)
    ? exito(limpio as Nit)
    : fallo('El NIT son de 5 a 15 dígitos, con el dígito de verificación opcional tras un guion');
};
