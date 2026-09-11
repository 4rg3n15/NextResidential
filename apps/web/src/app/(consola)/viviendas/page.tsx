import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { DirectorioDeViviendas } from './directorio';

export const metadata: Metadata = { title: 'Viviendas' };
export const dynamic = 'force-dynamic';

/** W-03 · Viviendas (HU-01, HU-02, RN-13, RN-19, CA-02). */
const Viviendas = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <DirectorioDeViviendas copropiedadId={copropiedadId} />;
};

export default Viviendas;
