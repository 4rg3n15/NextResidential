import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeMisVehiculos } from './pantalla';

export const metadata: Metadata = { title: 'Mis vehículos' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-3 · los vehículos de mi vivienda, con alta y baja propias. */
const MisVehiculos = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  return <PantallaDeMisVehiculos copropiedadId={ambito.copropiedadId} />;
};

export default MisVehiculos;
