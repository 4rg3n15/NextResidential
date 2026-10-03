import type { JSX } from 'react';
import Link from 'next/link';

/** E8 (15-R) · AR-04 · con la recuperación por correo desactivada, a quién acudir. */
export const EnlaceDeRecuperacion = ({ activa }: { readonly activa: boolean }): JSX.Element => (
  <p className="text-secundario text-texto-apagado">
    {activa ? (
      <Link
        href="/acceso/recuperacion"
        className="font-medium text-marca-texto underline underline-offset-2"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    ) : (
      <>
        ¿Olvidaste tu contraseña?{' '}
        <strong className="font-medium text-texto">Contacta al administrador</strong> de tu
        copropiedad: te asigna una temporal.
      </>
    )}
  </p>
);
