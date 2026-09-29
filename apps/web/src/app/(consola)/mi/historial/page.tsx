import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeMiHistorial } from './pantalla';

export const metadata: Metadata = { title: 'Historial' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-6 · el historial de accesos de mi vivienda. */
const MiHistorial = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeMiHistorial copropiedadId={ambito.copropiedadId} />;
};

export default MiHistorial;
