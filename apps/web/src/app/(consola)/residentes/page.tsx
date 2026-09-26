import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeResidentes } from './pantalla';

export const metadata: Metadata = { title: 'Residentes' };
export const dynamic = 'force-dynamic';

/**
 * ETAPA 15-I (3.1, D5 a, D6) · supervisión de residentes. Sólo el
 * superadministrador: la API lo impone por su guarda, y aquí se dice en vez de
 * pintar secciones que responderían 403.
 */
const Residentes = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol !== 'superadministrador') {
    return (
      <EstadoSinPermiso descripcion="La supervisión de residentes es del superadministrador." />
    );
  }
  const alcance = await alcanceActivo();
  if (alcance.copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeResidentes copropiedadId={alcance.copropiedadId} />;
};

export default Residentes;
