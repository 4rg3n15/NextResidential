import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDePorteros } from './pantalla';

export const metadata: Metadata = { title: 'Porteros' };
export const dynamic = 'force-dynamic';

/**
 * B4 (ADR-024) · panel de supervisión de portería. Sólo el superadministrador:
 * la API lo impone por su guarda, y aquí se dice en vez de pintar tres
 * secciones que responderían 403.
 */
const Porteros = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol !== 'superadministrador') {
    return <EstadoSinPermiso descripcion="La supervisión de portería es del superadministrador." />;
  }
  const alcance = await alcanceActivo();
  if (alcance.copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDePorteros copropiedadId={alcance.copropiedadId} />;
};

export default Porteros;
