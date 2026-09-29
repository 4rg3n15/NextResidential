import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeMisVisitas } from './pantalla';

export const metadata: Metadata = { title: 'Visitas' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-4 · mis visitantes: registrar, volver a autorizar y ver el estado. */
const MisVisitas = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeMisVisitas copropiedadId={ambito.copropiedadId} />;
};

export default MisVisitas;
