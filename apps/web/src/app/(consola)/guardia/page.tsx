import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeGuardiaVirtual } from './pantalla';

export const metadata: Metadata = { title: 'Guardia virtual' };
export const dynamic = 'force-dynamic';

/**
 * W-12 · Consola de guardia virtual — CU-03, HU-25 a HU-29.
 *
 * **Es una superficie distinta de la portería (C-12)**, no la misma con más
 * botones: quien la usa atiende varias copropiedades y no ve ninguna. El
 * selector de la cabecera conmuta entre ellas, y la clave de consulta lleva la
 * copropiedad delante para que la caché del navegador no mezcle dos tenants
 * (KPI-35) — una fuga silenciosa que no sale de la máquina del operador.
 */
const GuardiaVirtual = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  if (sesion.rol === 'residente' || sesion.rol === 'servicio' || sesion.rol === 'portero') {
    return (
      <EstadoSinPermiso descripcion="La guardia virtual es del operador de central y de la administración. El portero atiende su propia puerta desde Portería." />
    );
  }
  const alcance = await alcanceActivo();
  if (alcance.copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  const activa = alcance.disponibles.find((c) => c.id === alcance.copropiedadId);
  return (
    <PantallaDeGuardiaVirtual
      copropiedadId={alcance.copropiedadId}
      nombreDeCopropiedad={activa?.nombre ?? 'la copropiedad activa'}
    />
  );
};

export default GuardiaVirtual;
