import 'server-only';
import { sesionActual } from '@/lib/sesion/servidor';

/**
 * La copropiedad de la sesión, resuelta en el SERVIDOR.
 *
 * Existe para que las siete pantallas de la 09-B no repitan —ni cada una a su
 * manera— la decisión que el tablero ya había tomado: **el identificador sale
 * del token, nunca de la URL ni de un desplegable**. Uno que viniera del
 * cliente sería un identificador que el usuario controla; la API lo rechazaría
 * con 404, pero la consola estaría invitando a intentarlo.
 *
 * Devuelve `null` cuando la identidad no tiene ninguna asignada —le pasa a un
 * operador de central sin turno—, y cada pantalla muestra su estado «sin
 * permiso» con esa explicación en vez de un tablero vacío sin motivo.
 */
export const copropiedadDeLaSesion = async (): Promise<string | null> => {
  const sesion = await sesionActual();
  if (sesion === null) return null;
  return sesion.copropiedadId ?? sesion.copropiedadesAtendidas[0] ?? null;
};
