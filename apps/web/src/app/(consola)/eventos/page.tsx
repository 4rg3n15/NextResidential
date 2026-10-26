import type { JSX } from 'react';
import type { Metadata } from 'next';
import type { Rol } from '@ncr/contracts';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeEventos } from './pantalla';

export const metadata: Metadata = { title: 'Eventos y alertas' };
export const dynamic = 'force-dynamic';

/** W-08 · Eventos y alertas (HU-32, HU-35, CA-18, CA-23). */
const Eventos = async ({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  const alcance = await alcanceActivo();
  const copropiedadId = alcance.copropiedadId;
  if (copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  // D-145 · los filtros llegan en la URL; sólo los de un valor, el resto se ignora.
  const parametros = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) =>
      typeof v === 'string' ? [[k, v] as [string, string]] : [],
    ),
  ).toString();
  // Otros fallos (15-M) · la llave reinicia filtros al cambiar de copropiedad.
  return (
    <PantallaDeEventos
      key={copropiedadId}
      copropiedadId={copropiedadId}
      rol={sesion.rol as Rol}
      parametros={parametros}
    />
  );
};

export default Eventos;
