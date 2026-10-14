import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from './ambito';
import { PantallaDeInicio } from './inicio';
import { PuertaDelPrimerIngreso } from './puerta-del-primer-ingreso';

export const metadata: Metadata = { title: 'Mi vivienda' };
export const dynamic = 'force-dynamic';

/** 15-M (C3) · M-1 · el inicio del residente: su vivienda, atajos y actividad. */
const MiVivienda = async (): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  // 15-Y1 · como en la app: sin persona en su vivienda, primero el primer ingreso.
  return (
    <PuertaDelPrimerIngreso copropiedadId={ambito.copropiedadId} cuenta={ambito.usuarioId}>
      <PantallaDeInicio copropiedadId={ambito.copropiedadId} />
    </PuertaDelPrimerIngreso>
  );
};

export default MiVivienda;
