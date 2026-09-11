import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeDispositivos } from './pantalla';

export const metadata: Metadata = { title: 'Dispositivos' };
export const dynamic = 'force-dynamic';

/** W-07 · Dispositivos y sincronización (HU-36, RN-21, CA-26). */
const Dispositivos = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeDispositivos copropiedadId={copropiedadId} />;
};

export default Dispositivos;
