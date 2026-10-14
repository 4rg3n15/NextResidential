import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';
import { rutaInicialDe } from '@/lib/navegacion';
import type { Rol } from '@ncr/contracts';
import { MarcoDeAcceso } from '../marco';
import { FormularioDeCrearCuenta } from './formulario-crear-cuenta';

export const metadata: Metadata = { title: 'Crear cuenta' };
export const dynamic = 'force-dynamic';

/**
 * 15-Y1 · «Crear cuenta» para el residente sin app (P-23). Pública, como la
 * ruta de la API que usa; con sesión abierta no tiene sentido y se va al inicio.
 */
const CrearCuenta = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion !== null) redirect(rutaInicialDe(sesion.rol as Rol));
  return (
    <MarcoDeAcceso
      titulo="Crear cuenta"
      descripcion="Para residentes mayores de edad con el código de invitación de una plaza de su vivienda, que les comparte el titular."
    >
      <FormularioDeCrearCuenta />
    </MarcoDeAcceso>
  );
};

export default CrearCuenta;
