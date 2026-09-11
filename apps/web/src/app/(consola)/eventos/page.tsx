import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeEventos } from './pantalla';

export const metadata: Metadata = { title: 'Eventos y alertas' };
export const dynamic = 'force-dynamic';

/** W-08 · Eventos y alertas (HU-32, HU-35, CA-18, CA-23). */
const Eventos = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeEventos copropiedadId={copropiedadId} />;
};

export default Eventos;
