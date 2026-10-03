import type { JSX } from 'react';
import type { Metadata } from 'next';
import { MarcoDeAcceso } from '../marco';
import { RecuperacionSegunDespliegue } from '../segun-recuperacion';

export const metadata: Metadata = { title: 'Recuperar contraseña' };
export const dynamic = 'force-dynamic'; // E8 · AR-04: depende del despliegue
const Recuperacion = (): JSX.Element => (
  <MarcoDeAcceso
    titulo="Recuperar contraseña"
    descripcion="Te enviamos un enlace de un solo uso al correo de tu cuenta."
  >
    <RecuperacionSegunDespliegue />
  </MarcoDeAcceso>
);

export default Recuperacion;
