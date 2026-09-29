import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';

export const metadata: Metadata = { title: 'Sin consola para esta identidad' };
export const dynamic = 'force-dynamic';

/**
 * La identidad que entra por el navegador sin tener consola (hoy, sólo la de
 * servicio: desde la 15-M el residente tiene la suya en `/mi`, D-12).
 *
 * **No es «sin permiso», y antes lo decía.** Reusaba `EstadoSinPermiso`, con su
 * candado y su título «Sin permiso», y eso describe mal el hecho: el residente
 * tiene permiso de sobra sobre sus propios datos; lo que no existe todavía es
 * la superficie. Un candado le dice «te han denegado algo», que es falso y
 * además le manda a pedirle acceso a un administrador que no puede dárselo.
 *
 * Lo que sí necesita saber: que su sitio es la aplicación móvil, qué podrá
 * hacer en ella y que su cuenta ya funciona. Esto último importa más de lo que
 * parece: es la pantalla que ve al terminar de aprovisionarse, y sin ese dato
 * no sabe si su acceso quedó bien.
 */
const SinConsola = async (): Promise<JSX.Element> => {
  const sesion = await sesionActual();
  if (sesion === null) redirect('/acceso');
  // 15-M (D-12) · el residente YA tiene consola: su inicio es «Mi vivienda».
  if (sesion.rol === 'residente') redirect('/mi');

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-tarjeta bg-marca-suave text-marca-texto"
      >
        {/* Lucide `smartphone` (ISC). Ver docs/decisiones/ADR-013. */}
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
          <path d="M12 18h.01" />
        </svg>
      </div>

      <h1 className="text-titulo text-texto">Esta identidad no usa la consola</h1>
      <p className="mt-2 text-cuerpo text-texto-apagado">
        La consola web es para las personas: administración, portería, guardia virtual y residentes.
        Una identidad de servicio o integración se conecta a la API por su propio canal y no tiene
        pantallas aquí.
      </p>
    </div>
  );
};

export default SinConsola;
