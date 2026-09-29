import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeMisNotificaciones } from './pantalla';

export const metadata: Metadata = { title: 'Notificaciones' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-7 · los avisos de mis visitas. */
const MisNotificaciones = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeMisNotificaciones copropiedadId={ambito.copropiedadId} />;
};

export default MisNotificaciones;
