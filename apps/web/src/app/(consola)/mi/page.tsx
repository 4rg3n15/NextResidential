import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from './ambito';
import { PantallaDeInicio } from './inicio';

export const metadata: Metadata = { title: 'Mi vivienda' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-1 · el inicio del residente: su vivienda, atajos y actividad. */
const MiVivienda = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeInicio copropiedadId={ambito.copropiedadId} />;
};

export default MiVivienda;
