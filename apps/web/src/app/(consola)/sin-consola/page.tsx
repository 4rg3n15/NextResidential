import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion/servidor';

export const metadata: Metadata = { title: 'Tu aplicación llega en la ETAPA 11' };
export const dynamic = 'force-dynamic';

/**
 * El residente que entra por el navegador.
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

      <h1 className="text-titulo text-texto">Tu acceso está listo</h1>
      <p className="mt-2 text-cuerpo text-texto-apagado">
        La consola web es para la administración y la portería. Como residente, tu superficie es la
        aplicación móvil de Next Control Residencial, que se entrega en la{' '}
        <strong className="font-semibold text-texto">ETAPA 11</strong>.
      </p>

      <div className="mt-8 w-full rounded-tarjeta border border-borde bg-tarjeta p-5 text-left">
        <p className="text-etiqueta uppercase tracking-wide text-texto-apagado">
          Lo que podrás hacer desde la aplicación
        </p>
        <ul className="mt-3 space-y-2 text-cuerpo text-texto">
          {[
            'Autorizar visitantes, con vigencia y acompañantes',
            'Registrar los vehículos de tu vivienda',
            'Solicitar acceso a las zonas comunes',
            'Consultar el historial de accesos de tu vivienda',
          ].map((linea) => (
            <li key={linea} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marca"
              />
              {linea}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-secundario text-texto-apagado">
        Mientras tanto, tu cuenta ya está activa y tus autorizaciones las puede crear por ti la
        administración de tu copropiedad.
      </p>
    </div>
  );
};

export default SinConsola;
