import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeBiometria } from './pantalla';

export const metadata: Metadata = { title: 'Rostro del visitante' };
export const dynamic = 'force-dynamic';

/**
 * Captura biométrica desde la consola — **anticipo autorizado del punto 4 de la
 * ETAPA 16**, no alcance de la 15.
 *
 * Hasta hoy la captura existía sólo en la app del residente (ADR-016), así que
 * el recorrido facial no se podía originar desde el escritorio y el
 * superadministrador no tenía por dónde adjuntar un rostro. Esta pantalla
 * **no inventa un camino nuevo**: usa los mismos casos de uso de la ETAPA 08
 * —calidad (CA-08), consentimiento del TITULAR (RN-09, RN-10) y
 * sincronización—, con otra puerta.
 */
const Biometria = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  return <PantallaDeBiometria copropiedadId={copropiedadId} />;
};

export default Biometria;
