import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { TableroOperativo } from './tablero-operativo';
import { EstadoSinPermiso } from '@/componentes/estados';

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
 * El operador de central atiende varias (KPI-35) y su selector llega con la
 * consola de guardia virtual, en la ETAPA 10; aquí se toma la primera de su
 * turno para que el tablero no quede inservible para ese rol.
 */
const Tablero = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');

  const copropiedadId = sesion.copropiedadId ?? sesion.copropiedadesAtendidas[0] ?? null;
  if (copropiedadId === null) {
    return (
      <EstadoSinPermiso descripcion="Tu sesión no tiene ninguna copropiedad asignada. Un administrador debe asignarte al menos una para que el tablero tenga qué mostrar." />
    );
  }

  return <TableroOperativo copropiedadId={copropiedadId} />;
};

export default Tablero;
