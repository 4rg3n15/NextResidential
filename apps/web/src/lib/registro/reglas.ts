/**
 * 15-Y1 · las reglas de FORMA de «Crear cuenta», las mismas y con las mismas
 * palabras que la app (`apps/mobile/lib/dominio/registro.dart`). Son cortesía:
 * la verdad la dice el servidor. Ninguna regla de aquí sabe si un código es
 * válido, sólo si tiene forma de código; el servidor contesta UNA respuesta
 * genérica para el inválido, el usado y el de otro conjunto, y la consola la
 * pinta tal cual.
 */
export { motivoDeFechaDeAdulto } from './edad';

const LONGITUD_DEL_CODIGO = 8;

/**
 * El código corto de la copropiedad, que es el prefijo del código de
 * invitación: lo que va delante de sus ocho últimos símbolos, con o sin
 * guiones y espacios. `null` si no hay uno con forma de código de conjunto.
 */
export const copropiedadDelCodigo = (codigoDeInvitacion: string): string | null => {
  const limpio = codigoDeInvitacion.replace(/[\s-]/g, '').toUpperCase();
  if (limpio.length <= LONGITUD_DEL_CODIGO) return null;
  const prefijo = limpio.slice(0, limpio.length - LONGITUD_DEL_CODIGO);
  return /^[A-Z0-9]{3,8}$/.test(prefijo) ? prefijo : null;
};

export const motivoDeCodigoDeInvitacion = (bruto: string): string | null => {
  if (bruto.trim() === '') return 'Escriba el código de invitación';
  if (copropiedadDelCodigo(bruto) === null) {
    return 'Escriba el código completo, como MIRA-K7PQ-2XWZ';
  }
  return null;
};

/** El usuario como lo normaliza el servidor: recortado y en minúsculas. */
export const normalizarUsuario = (bruto: string): string => bruto.trim().toLowerCase();

export const motivoDeUsuarioInvalido = (bruto: string): string | null => {
  const u = normalizarUsuario(bruto);
  if (u.length < 3 || u.length > 32) return 'El usuario tiene entre 3 y 32 caracteres';
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(u)) {
    return (
      'El usuario admite letras sin tilde, números, punto, guion y guion bajo, ' +
      'y empieza por letra o número'
    );
  }
  return null;
};

export const motivoDeCorreoInvalido = (bruto: string): string | null => {
  const c = bruto.trim();
  if (c === '') return 'Escriba su correo';
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c) ? null : 'Escriba un correo válido';
};

/**
 * Cuándo se puede pulsar «Crear cuenta»: todo escrito, las dos contraseñas
 * iguales, la política recibida y la casilla marcada.
 */
export const registroListoParaEnviar = (f: {
  readonly usuario: string;
  readonly correo: string;
  readonly contrasena: string;
  readonly confirmacion: string;
  readonly codigo: string;
  readonly fechaNacimiento: string;
  readonly aceptada: boolean;
  readonly hayPolitica: boolean;
}): boolean => {
  const escritos = [f.usuario, f.correo, f.codigo, f.fechaNacimiento].every((v) => v.trim() !== '');
  return (
    escritos &&
    f.contrasena !== '' &&
    f.contrasena === f.confirmacion &&
    f.aceptada &&
    f.hayPolitica
  );
};

/** La política de contraseña, dicha como la dice la app (`acceso.dart`). */
export const motivoDeRechazoDeContrasena = (c: string): string | null => {
  if (c.length > 256) return 'La contraseña no puede superar los 256 caracteres';
  const faltan = [
    c.length < 8 ? 'al menos 8 caracteres' : null,
    /\p{Lu}/u.test(c) ? null : 'una letra mayúscula',
    /\p{Ll}/u.test(c) ? null : 'una letra minúscula',
    /\p{Nd}/u.test(c) ? null : 'un número',
    /[^\p{L}\p{Nd}\s]/u.test(c) ? null : 'un carácter especial',
  ].filter((m): m is string => m !== null);
  return faltan.length === 0 ? null : `A la contraseña le falta: ${faltan.join(', ')}`;
};
