import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import type { Rol } from '@ncr/contracts';
import { sesionActual } from '@/lib/sesion/servidor';
import { MarcoDeConsola } from '@/componentes/marco-consola';
import { ProveedorDeConsultas } from '@/lib/api/proveedor';

export const dynamic = 'force-dynamic';

/**
 * Marco de la consola. La sesión se resuelve **en el servidor y antes de pintar
 * nada**: un componente de cliente que redirige tras montarse enseña el
 * esqueleto de la consola a quien no ha entrado, y ese vistazo ya revela la
 * estructura del sistema.
 */
const LayoutDeConsola = async ({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');

  return (
    <ProveedorDeConsultas>
      <MarcoDeConsola sesion={sesion} rol={sesion.rol as Rol}>
        {children}
      </MarcoDeConsola>
    </ProveedorDeConsultas>
  );
};

export default LayoutDeConsola;
