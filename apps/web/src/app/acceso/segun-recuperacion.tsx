import type { JSX } from 'react';
import { despliegue } from '@/lib/configuracion-de-despliegue';
import { MENSAJE_RECUPERACION_DESACTIVADA } from '@/lib/recuperacion';
import { FormularioDeRecuperacion } from './recuperacion/formulario-recuperacion';
import { FormularioDeNuevaContrasena } from './nueva-contrasena/formulario-nueva-contrasena';

/**
 * E8 (15-R) · AR-04 · las dos páginas del flujo por correo, según el despliegue:
 * con la recuperación desactivada no hay formulario, sólo a quién acudir.
 */
const Desactivada = (): JSX.Element => (
  <p
    role="status"
    className="rounded-campo bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto"
  >
    {MENSAJE_RECUPERACION_DESACTIVADA}
  </p>
);

export const RecuperacionSegunDespliegue = (): JSX.Element =>
  despliegue().recuperacionPorCorreo ? <FormularioDeRecuperacion /> : <Desactivada />;

export const NuevaContrasenaSegunDespliegue = ({
  tokenHash,
}: {
  readonly tokenHash: string | null;
}): JSX.Element =>
  despliegue().recuperacionPorCorreo ? (
    <FormularioDeNuevaContrasena tokenHash={tokenHash} />
  ) : (
    <Desactivada />
  );
