import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeVehiculos } from './pantalla';

export const metadata: Metadata = { title: 'Vehículos y placas' };
export const dynamic = 'force-dynamic';

/** W-04 · Vehículos y placas (HU-04, HU-05, RN-04, CA-03). */
const Vehiculos = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeVehiculos copropiedadId={copropiedadId} />;
};

export default Vehiculos;
