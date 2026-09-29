import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeMiPerfil } from './pantalla';

export const metadata: Metadata = { title: 'Perfil' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-8 · mi perfil: mis datos, mi conjunto y mis ocupantes. */
const MiPerfil = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeMiPerfil copropiedadId={ambito.copropiedadId} />;
};

export default MiPerfil;
