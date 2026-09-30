import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { EstadoSinPermiso } from '@/componentes/estados';
import { alcanceActivo, motivoSinCopropiedad } from '../copropiedad';
import { PantallaDeGuardiaVirtual } from './pantalla';

/** G2 (15-N) · `?atender=<id>` del aviso de otra pantalla; sólo un UUID, nada más. */
const elementoPedido = (valor: string | string[] | undefined): string | undefined =>
  typeof valor === 'string' && /^[0-9a-f-]{36}$/i.test(valor) ? valor : undefined;

export const metadata: Metadata = { title: 'Guardia virtual' };
export const dynamic = 'force-dynamic';

/**
 * W-12 · Consola de guardia virtual — CU-03, HU-25 a HU-29.
 *
 * **Es una superficie distinta de la portería (C-12)**, no la misma con más
 * botones: quien la usa atiende varias copropiedades y no ve ninguna. El
 * selector de la cabecera conmuta entre ellas, y la clave de consulta lleva la
 * copropiedad delante para que la caché del navegador no mezcle dos tenants
 * (KPI-35) — una fuga silenciosa que no sale de la máquina del operador.
 */
const GuardiaVirtual = async ({
  searchParams,
}: {
  readonly searchParams: Promise<{ atender?: string | string[] }>;
}): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  // 15-L (H4) · el portero también hace guardia remota, pero SÓLO desde las IP
  // que el superadministrador permite: eso lo decide la API en cada petición.
  if (sesion.rol === 'residente' || sesion.rol === 'servicio') {
    return (
      <EstadoSinPermiso descripcion="La guardia virtual es del operador de central, de los porteros y de la administración." />
    );
  }
  const alcance = await alcanceActivo();
  if (alcance.copropiedadId === null) {
    return <EstadoSinPermiso descripcion={motivoSinCopropiedad(alcance)} />;
  }
  const activa = alcance.disponibles.find((c) => c.id === alcance.copropiedadId);
  // Otros fallos (15-M) · la llave reinicia el estado del cliente al cambiar de
  // copropiedad: sin ella, lo abierto en la anterior seguía en pantalla.
  return (
    <PantallaDeGuardiaVirtual
      key={alcance.copropiedadId}
      copropiedadId={alcance.copropiedadId}
      nombreDeCopropiedad={activa?.nombre ?? 'la copropiedad activa'}
      atender={elementoPedido((await searchParams).atender)}
    />
  );
};

export default GuardiaVirtual;
