import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { rutaInicialDe } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';

/**
 * Puerta de entrada. Se decide **en el servidor**, antes de enviar nada: una
 * redirección hecha en el cliente enseña un instante de consola a quien no ha
 * iniciado sesión, y ese instante ya es información.
 */
const Inicio = async (): Promise<never> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  redirect(rutaInicialDe(sesion.rol as Rol));
};

export default Inicio;
