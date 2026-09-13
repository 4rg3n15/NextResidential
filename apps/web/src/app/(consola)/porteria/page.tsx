import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDePorteria } from './pantalla';

export const metadata: Metadata = { title: 'Portería' };
export const dynamic = 'force-dynamic';

/**
 * W-11 · Consola de portería — HU-21 a HU-24.
 *
 * El residente no entra: **no es una pantalla que se le oculte, es una que no
 * le corresponde**. La comprobación de rol vive aquí y además en cada ruta de
 * la API; esta sólo evita el viaje y explica por qué.
 */
const Porteria = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol === 'residente' || sesion.rol === 'servicio') {
    return (
      <EstadoSinPermiso descripcion="La consola de portería es de los roles operativos: portero, operador de central y administración." />
    );
  }
  const alcance = await alcanceActivo();
  if (alcance.copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDePorteria copropiedadId={alcance.copropiedadId} />;
};

export default Porteria;
