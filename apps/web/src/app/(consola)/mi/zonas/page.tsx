import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeMisZonas } from './pantalla';

export const metadata: Metadata = { title: 'Zonas comunes' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-5 · zonas comunes con aforo y horario en vivo. */
const MisZonas = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeMisZonas copropiedadId={ambito.copropiedadId} />;
};

export default MisZonas;
