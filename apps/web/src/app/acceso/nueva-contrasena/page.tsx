import type { JSX } from 'react';
import type { Metadata } from 'next';
import { MarcoDeAcceso } from '../marco';
import { FormularioDeNuevaContrasena } from './formulario-nueva-contrasena';

export const metadata: Metadata = { title: 'Nueva contraseña' };
export const dynamic = 'force-dynamic';

/**
 * Destino del enlace del correo.
 *
 * El `token_hash` llega **como parámetro de consulta**, no en el fragmento:
 * es lo que permite que el canje ocurra en el servidor y que el token nunca
 * pase por JavaScript de la página. La plantilla de correo de Supabase hay que
 * configurarla para que lo emita así — está en
 * `docs/guias/RECUPERACION_Y_USUARIOS.md`, paso 3.
 */
const NuevaContrasena = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> => {
  const parametros = await searchParams;
  const bruto = parametros.token_hash ?? parametros.token;
  const tokenHash = typeof bruto === 'string' ? bruto : null;

  return (
    <MarcoDeAcceso
      titulo="Nueva contraseña"
      descripcion={
        tokenHash === null
          ? 'Este enlace no es válido.'
          : 'Elige una contraseña nueva para tu cuenta.'
      }
    >
      <FormularioDeNuevaContrasena tokenHash={tokenHash} />
    </MarcoDeAcceso>
  );
};

export default NuevaContrasena;
