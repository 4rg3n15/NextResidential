import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeVisitantes } from './pantalla';

export const metadata: Metadata = { title: 'Visitantes y autorizaciones' };
export const dynamic = 'force-dynamic';

/** W-05 · Visitantes y autorizaciones (HU-07 a HU-10, HU-16, HU-17, CA-04…CA-07). */
const Visitantes = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeVisitantes copropiedadId={copropiedadId} />;
};

export default Visitantes;
