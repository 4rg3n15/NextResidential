import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { TableroOperativo } from './tablero-operativo';
import { EstadoSinPermiso } from '@/componentes/estados';
import { navegacionDe, rutaInicialDe } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';

export const metadata: Metadata = { title: 'Dashboard operativo' };
export const dynamic = 'force-dynamic';

/**
 * W-02 · Dashboard operativo (HU-38).
 *
 * La copropiedad **no se elige en el cliente**: sale del token. Un identificador
 * que viniera de la URL o de un desplegable sería un identificador que el
 * usuario controla, y aunque la API lo rechazaría con 404, la consola estaría
 * invitando a intentarlo.
 *
 * Quien alcanza varias —superadministrador y operador de central— elige en la
 * cabecera, y la elección va por cookie `httpOnly` contrastada contra el
 * catálogo de la API. Hasta la 09-B, `null` se leía como «sin permiso»: el
 * superadministrador no pertenece a ninguna copropiedad y la consola le negaba
 * las ocho pantallas.
 */
const Tablero = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  // 15-L · quien no tiene el tablero en su menú (el portero) va a su inicio:
  // pintarlo sería pedir tres indicadores que la API le niega.
  const rol = sesion.rol as Rol;
  if (!navegacionDe(rol).some((e) => e.clave === 'tablero')) redirect(rutaInicialDe(rol));

  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }

  return <TableroOperativo copropiedadId={copropiedadId} />;
};

export default Tablero;
