import type { JSX } from 'react';
import type { Metadata } from 'next';
import { MarcoDeAcceso } from '../marco';
import { FormularioDeRecuperacion } from './formulario-recuperacion';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

const Recuperacion = (): JSX.Element => (
  <MarcoDeAcceso
    titulo="Recuperar contraseña"
    descripcion="Te enviamos un enlace de un solo uso al correo de tu cuenta."
  >
    <FormularioDeRecuperacion />
  </MarcoDeAcceso>
);

export default Recuperacion;
