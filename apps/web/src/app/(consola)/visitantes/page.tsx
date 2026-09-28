import type { JSX } from 'react';
import type { Metadata } from 'next';
import type { Rol } from '@ncr/contracts';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeVisitantes } from './pantalla';

export const metadata: Metadata = { title: 'Visitantes' };
export const dynamic = 'force-dynamic';

/** W-05 · Visitantes: generar autorización, la lista del día o el historial (15-L, F). */
const Visitantes = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeVisitantes copropiedadId={copropiedadId} rol={sesion.rol as Rol} />;
};

export default Visitantes;
