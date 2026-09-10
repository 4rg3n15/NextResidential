import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { copropiedadDeLaSesion } from '../copropiedad';
import { PantallaDeVisitantes } from './pantalla';

export const metadata: Metadata = { title: 'Visitantes y autorizaciones' };
export const dynamic = 'force-dynamic';

/** W-05 · Visitantes y autorizaciones (HU-07 a HU-10, HU-16, HU-17, CA-04…CA-07). */
const Visitantes = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const copropiedadId = await copropiedadDeLaSesion();
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion="Tu sesión no tiene ninguna copropiedad asignada." />;
  }
  return <PantallaDeVisitantes copropiedadId={copropiedadId} />;
};

export default Visitantes;
