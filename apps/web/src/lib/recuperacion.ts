import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { despliegue } from './configuracion-de-despliegue';

/**
 * 15-R · E8 · AR-04 · LA RECUPERACIÓN POR CORREO, DESACTIVADA EN PRODUCCIÓN
 *
 * El correo no se pudo verificar de punta a punta (BE-01) y el cliente decidió
 * que el restablecimiento lo hace una PERSONA (D4: la administración asigna una
 * temporal con cambio obligatorio). Con `RECUPERACION_POR_CORREO` sin declarar,
 * en producción no se ofrece ni se atiende: la ruta contesta SIEMPRE lo mismo
 * —sin mirar el correo, así que no revela si la cuenta existe— y la consola
 * dice a quién acudir.
 */
export const MENSAJE_RECUPERACION_DESACTIVADA =
  'La recuperación de contraseña por correo está desactivada. Contacta al administrador de tu ' +
  'copropiedad: te asigna una contraseña temporal que cambiarás al entrar.';

export const CUERPO_RECUPERACION_DESACTIVADA = {
  mensaje: MENSAJE_RECUPERACION_DESACTIVADA,
  desactivada: true,
} as const;

/**
 * Envuelve las rutas del flujo por correo: desactivado, 403 con el mismo cuerpo
 * SIEMPRE y sin leer la petición (no revela si la cuenta existe ni da tiempos
 * distintos que medir).
 */
export const conRecuperacionActiva =
  (manejador: (peticion: NextRequest) => Promise<NextResponse>) =>
  async (peticion: NextRequest): Promise<NextResponse> =>
    despliegue().recuperacionPorCorreo
      ? manejador(peticion)
      : NextResponse.json(CUERPO_RECUPERACION_DESACTIVADA, { status: 403 });
