import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { sesionActual } from '@/lib/sesion/servidor';
import { claimsVisibles } from '@/lib/sesion/porteria';
import { rutaInicialDe } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';
import { FormularioDeAcceso } from './formulario-acceso';
import { MarcoDeAcceso } from './marco';

export const metadata: Metadata = { title: 'Acceso' };
export const dynamic = 'force-dynamic';

/**
 * 15-H · los avisos con los que la consola manda aquí a un portero. Lista
 * cerrada: el parámetro de la dirección elige un texto, nunca lo trae.
 */
const AVISOS: Readonly<Record<string, string>> = {
  turno: 'Tu turno terminó y la sesión se cerró. Podrás entrar de nuevo en tu próximo turno.',
  patrullaje:
    'La sesión se cerró tras cinco códigos de patrullaje incorrectos. Entra de nuevo con tu contraseña.',
  sesion: 'Tu sesión de portería terminó. Vuelve a entrar.',
};

/**
 * Página de acceso.
 *
 * Con el cambio de contraseña pendiente (ADR-023) se abre directamente en ese
 * paso: la sesión existe, pero la API no admite nada más hasta cambiarla.
 */
const Acceso = async ({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> => {
  const parametros = await searchParams;
  const claims = await claimsVisibles();
  const cambioPendiente = claims?.debeCambiarContrasena === true;
  if (!cambioPendiente) {
    const sesion = await sesionActual();
    if (sesion !== null) redirect(rutaInicialDe(sesion.rol as Rol));
  }
  const aviso = typeof parametros['aviso'] === 'string' ? AVISOS[parametros['aviso']] : undefined;

  return (
    <MarcoDeAcceso
      titulo="Bienvenido"
      descripcion="Accede con tu correo, o con tu usuario y el NIT de la copropiedad. El sistema te lleva a la superficie que corresponde a tu rol."
    >
      {aviso === undefined ? null : (
        <p
          role="status"
          className="mb-4 rounded-campo bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto"
        >
          {aviso}
        </p>
      )}
      <FormularioDeAcceso pasoInicial={cambioPendiente ? 'cambio' : 'credenciales'} />
    </MarcoDeAcceso>
  );
};

export default Acceso;
