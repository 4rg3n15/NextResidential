import type { JSX } from 'react';
import type { Metadata } from 'next';
import { ambitoDelResidente } from '../ambito';
import { PantallaDeRostro } from './pantalla-de-rostro';
import { RostroDeMenor } from './rostro-de-menor';

export const metadata: Metadata = { title: 'Mi rostro' };
export const dynamic = 'force-dynamic';

/**
 * 15-Y3 · «Mi rostro»; con `?menor=<residenteId>`, el rostro de un menor del
 * hogar (ADR-039). Es la ÚNICA ruta del residente con la cámara admitida en
 * `Permissions-Policy` (next.config.mjs).
 */
const MiRostro = async ({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly menor?: string | string[] }>;
}): Promise<JSX.Element> => {
  const ambito = await ambitoDelResidente();
  if (!ambito.ok) return ambito.elemento;
  const { menor } = await searchParams;
  const residenteId = typeof menor === 'string' && menor.trim() !== '' ? menor.trim() : null;
  return residenteId === null ? (
    <PantallaDeRostro copropiedadId={ambito.copropiedadId} menor={null} />
  ) : (
    <RostroDeMenor copropiedadId={ambito.copropiedadId} residenteId={residenteId} />
  );
};

export default MiRostro;
