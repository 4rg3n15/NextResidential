import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeInformes } from './pantalla';

export const metadata: Metadata = { title: 'Informes y auditoría' };
export const dynamic = 'force-dynamic';

/**
 * W-10 · Informes y auditoría (HU-32).
 *
 * «Auditoría de Sistema» es exclusiva de administración, como señaló el
 * análisis del mockup, y los cuatro tipos comparten ruta: la restricción la
 * aplica el guard de la API sobre el conjunto. Aquí se comprueba además el rol
 * para no ofrecer una pantalla que va a devolver 403 entera.
 */
const Informes = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol !== 'administrador' && sesion.rol !== 'superadministrador') {
    return (
      <EstadoSinPermiso descripcion="Los informes y la auditoría del sistema son exclusivos de los roles administrativos." />
    );
  }
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeInformes copropiedadId={copropiedadId} />;
};

export default Informes;
