import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeFamilia } from './pantalla';

export const metadata: Metadata = { title: 'Mi familia' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-2 · los residentes de mi vivienda. */
const MiFamilia = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeFamilia copropiedadId={ambito.copropiedadId} />;
};

export default MiFamilia;
