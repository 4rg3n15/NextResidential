import 'server-only';
import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';

export type AmbitoDelResidente =
  | { readonly ok: true; readonly copropiedadId: string }
  | { readonly ok: false; readonly elemento: JSX.Element };

/**
 * 15-M (C3) · la comprobación de rol de TODAS las páginas del residente, en el
 * servidor y antes de pintar nada (como el marco de la consola).
 *
 * El rol es el que la API reconoce en `GET /auth/sesion`, no una lectura
 * propia del token. La copropiedad sale del token del residente —siempre la
 * lleva—, y la vivienda no se resuelve aquí ni en ninguna parte de la consola:
 * la resuelve la API desde la identidad en cada ruta `…/mi/…`. Un residente de
 * otra copropiedad recibe 403 de la API aunque tecleara la URL.
 */
export const ambitoDelResidente = async (): Promise<AmbitoDelResidente> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol !== 'residente') {
    return {
      ok: false,
      elemento: <EstadoSinPermiso descripcion="Estas páginas son del residente." />,
    };
  }
  if (sesion.copropiedadId === null) {
    return {
      ok: false,
      elemento: (
        <EstadoSinPermiso descripcion="Tu sesión no tiene copropiedad asignada. Habla con la administración de tu conjunto." />
      ),
    };
  }
  return { ok: true, copropiedadId: sesion.copropiedadId };
};
