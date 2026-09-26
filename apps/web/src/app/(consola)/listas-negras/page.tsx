import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeListasNegras } from './pantalla';

export const metadata: Metadata = { title: 'Listas negras' };
export const dynamic = 'force-dynamic';

const OPERACION = ['superadministrador', 'administrador', 'portero', 'operador_central'];

/**
 * ETAPA 15-I · HU-35 · RN-06 · RN-07. Vetan los cuatro roles de operación;
 * levantan sólo el administrador y el superadministrador. La API lo impone; la
 * pantalla sólo esconde el botón que respondería 403.
 */
const ListasNegras = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (!OPERACION.includes(sesion.rol)) {
    return <EstadoSinPermiso descripcion="Las listas negras son de la operación del conjunto." />;
  }
  const alcance = await alcanceActivo();
  if (alcance.copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return (
    <PantallaDeListasNegras
      copropiedadId={alcance.copropiedadId}
      puedeLevantar={sesion.rol === 'administrador' || sesion.rol === 'superadministrador'}
    />
  );
};

export default ListasNegras;
