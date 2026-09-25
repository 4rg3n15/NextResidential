import type { NombreDeUsuario } from './nombre-de-usuario';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CORREO SINTÉTICO · EL ÚNICO SITIO DEL SISTEMA QUE LO CONSTRUYE (ADR-023)
 *
 * El proveedor de identidad exige un correo por cuenta. Una cuenta por nombre
 * de usuario no tiene ninguno, así que se le da uno **que no puede recibir
 * nada**: bajo `.invalid`, el dominio que la RFC 2606 reserva precisamente para
 * que no resuelva jamás. Un restablecimiento por correo enviado a esta
 * dirección no llega a ninguna parte, y eso es lo que se quiere: el canal real
 * de recuperación de estas cuentas es una persona (P-18).
 *
 * Reglas que este fichero sostiene y la suite comprueba:
 *
 *  · Se CALCULA, no se guarda. Ninguna tabla nuestra lo tiene: se deriva del
 *    usuario y de la copropiedad cada vez que hace falta hablar con el
 *    proveedor, y en ningún otro momento.
 *  · Nunca aparece en una respuesta, un registro, un error ni la interfaz. El
 *    tipo es una marca para que sólo el adaptador del proveedor lo acepte.
 *  · Lleva la copropiedad dentro: dos conjuntos pueden tener cada uno su
 *    «porteria1» sin que el proveedor —que exige correo único— lo impida.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type CorreoSintetico = string & { readonly __marca: 'CorreoSintetico' };

export const DOMINIO_SINTETICO = 'usuarios.ncr.invalid';

export const correoSintetico = (usuario: NombreDeUsuario, copropiedadId: string): CorreoSintetico =>
  `${usuario}@${copropiedadId}.${DOMINIO_SINTETICO}` as CorreoSintetico;

/** Para la redacción de la bitácora y la prueba: ¿esta cadena contiene uno? */
export const contieneCorreoSintetico = (texto: string): boolean =>
  texto.toLowerCase().includes(`.${DOMINIO_SINTETICO}`);
