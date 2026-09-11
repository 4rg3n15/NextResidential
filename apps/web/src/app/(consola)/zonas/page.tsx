import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeZonas } from './pantalla';

export const metadata: Metadata = { title: 'Zonas comunes' };
export const dynamic = 'force-dynamic';

/** W-06 · Zonas comunes (HU-18, HU-19, HU-20, CU-05, CA-14, CA-15). */
const Zonas = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeZonas copropiedadId={copropiedadId} />;
};

export default Zonas;
