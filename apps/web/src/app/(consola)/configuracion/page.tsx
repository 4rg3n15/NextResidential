import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeConfiguracion } from './pantalla';

export const metadata: Metadata = { title: 'Configuración' };
export const dynamic = 'force-dynamic';

/**
 * W-09 · Configuración. Última entrada del menú que prometía una pantalla
 * inexistente: la barra la mostraba deshabilitada con el distintivo «09-B».
 *
 * **Lo que esta pantalla NO hace, y es deliberado.** No gestiona usuarios ni
 * restablecimientos: eso es el bloque 4, está por diseñar y construirlo aquí
 * ahora sería adelantar decisiones que el cliente todavía no ha tomado. Lo que
 * muestra es lo que ya existe y hoy solo se puede consultar entrando a la base
 * de datos: la identidad de la copropiedad activa, sus plazos de retención y el
 * estado de la sesión.
 */
const Configuracion = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol !== 'administrador' && sesion.rol !== 'superadministrador') {
    return (
      <EstadoSinPermiso descripcion="La configuración de la copropiedad es exclusiva de los roles administrativos." />
    );
  }
  const alcance = await alcanceActivo();
  if (alcance.copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeConfiguracion sesion={sesion} alcance={alcance} />;
};

export default Configuracion;
