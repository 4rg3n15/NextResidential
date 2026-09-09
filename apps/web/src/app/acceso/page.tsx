import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { sesionActual } from '@/lib/sesion/servidor';
import { rutaInicialDe } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';
import { FormularioDeAcceso } from './formulario-acceso';
import { MarcoDeAcceso } from './marco';

export const metadata: Metadata = { title: 'Acceso' };
export const dynamic = 'force-dynamic';

/**
 * W-01 · Acceso.
 *
 * **El selector «TIPO DE USUARIO» del mockup no está, y esa es la decisión.**
 * Hallazgo M-01 / contradicción C-05 de la auditoría: el rol no se elige, se
 * deriva de los claims del token (ETAPA 03). Un selector en el cliente sugiere
 * que la elección influye en los permisos —no lo hace, ni debe—, y además el
 * mockup solo ofrecía tres de los seis roles. El sistema enruta a la superficie
 * que corresponde al rol del token.
 *
 * Lo que sí se añade y el mockup no tenía: **paso de segundo factor** para los
 * roles administrativos (RN-20, CA-25).
 */
const Acceso = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion !== null) redirect(rutaInicialDe(sesion.rol as Rol));

  return (
    <MarcoDeAcceso titulo="Iniciar sesión" descripcion="Accede con el correo de tu copropiedad.">
      <FormularioDeAcceso className="mt-8" />
    </MarcoDeAcceso>
  );
};

export default Acceso;
