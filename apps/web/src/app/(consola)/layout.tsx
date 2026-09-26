import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import type { Rol } from '@ncr/contracts';
import { sesionActual } from '@/lib/sesion/servidor';
import { claimsVisibles, estadoDePorteria } from '@/lib/sesion/porteria';
import { BloqueoDePatrullaje } from '@/componentes/bloqueo-de-patrullaje';
import { MarcoDeConsola } from '@/componentes/marco-consola';
import { ProveedorDeConsultas } from '@/lib/api/proveedor';
import { alcanceActivo } from './copropiedad';

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
  /**
   * 15-H · antes de pedir la sesión: el cambio obligatorio (ADR-023) y el
   * estado del portero (ADR-024). Con cualquiera de los dos pendiente, la API
   * respondería 403 o 423 a todo lo que la consola pintara después.
   */
  const claims = await claimsVisibles();
  if (claims?.debeCambiarContrasena === true) redirect('/acceso?paso=cambio');
  const porteria = claims?.rol === 'portero' ? await estadoDePorteria() : null;
  if (claims?.rol === 'portero') {
    if (porteria === null || porteria.estado === 'sin_registro') redirect('/acceso?aviso=sesion');
    if (porteria.estado === 'fuera_de_turno') redirect('/acceso?aviso=turno');
    if (porteria.estado === 'cerrada') {
      redirect(
        `/acceso?aviso=${porteria.motivoCierre === 'intentos_agotados' ? 'patrullaje' : porteria.motivoCierre === 'fin_de_turno' ? 'turno' : 'sesion'}`,
      );
    }
    if (porteria.estado === 'patrullaje') return <BloqueoDePatrullaje estado={porteria} />;
  }

  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  // El alcance se resuelve UNA vez, aquí, y baja al marco. Que cada pantalla lo
  // pidiera por su cuenta multiplicaría la llamada y —peor— permitiría que dos
  // pantallas de la misma página discreparan sobre cuál es la copropiedad
  // activa.
  const alcance = await alcanceActivo();

  return (
    <ProveedorDeConsultas>
      <MarcoDeConsola sesion={sesion} rol={sesion.rol as Rol} alcance={alcance} porteria={porteria}>
        {children}
      </MarcoDeConsola>
    </ProveedorDeConsultas>
  );
};

export default LayoutDeConsola;
