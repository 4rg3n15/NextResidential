'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Rol } from '@ncr/contracts';
import { cn } from '@/lib/cn';
import { NOMBRE_DE_ROL, navegacionDe } from '@/lib/navegacion';

/**
 * Barra lateral oscura de ancho fijo — §5.4, y los nueve elementos de W-02.
 *
 * Dos detalles que no se ven en el mockup y sí en el código:
 *
 *  - El elemento activo lleva **filete rojo a la izquierda y `aria-current`**.
 *    El filete es para quien ve; `aria-current` es para quien no. Marcar solo
 *    con color de fondo dejaría fuera a los dos.
 *  - Las pantallas que aún no existen aparecen **deshabilitadas y con su
 *    etapa**. Un enlace a una pantalla no construida se percibe como una
 *    aplicación rota; decir «09-B» es información, no excusa.
 */
export const BarraLateral = ({
  rol,
  className,
}: {
  readonly rol: Rol;
  readonly className?: string;
}): JSX.Element => {
  const rutaActual = usePathname();
  const elementos = navegacionDe(rol);

  return (
    <nav
      aria-label="Navegación principal"
      className={cn('superficie-oscura flex w-lateral shrink-0 flex-col bg-oscuro', className)}
    >
      <div className="px-5 py-5">
        <p className="text-seccion font-bold text-texto-invertido">Next Control</p>
        <p className="text-etiqueta uppercase text-texto-invertidoApagado">Residencial</p>
      </div>

      <ul className="flex-1 space-y-0.5 px-3 py-2">
        {elementos.map((e) => {
          const activo = rutaActual === e.ruta || rutaActual.startsWith(`${e.ruta}/`);
          const disponible = e.pendienteDeEtapa === null;

          if (!disponible) {
            return (
              <li key={e.clave}>
                <span
                  aria-disabled="true"
                  title={`Se construye en la ETAPA ${e.pendienteDeEtapa}`}
                  className="flex cursor-not-allowed items-center justify-between gap-2 rounded-boton px-3 py-2.5 text-cuerpo text-texto-invertidoApagado opacity-60"
                >
                  {e.etiqueta}
                  <span className="rounded-distintivo bg-oscuro-elevado px-1.5 py-0.5 text-distintivo">
                    {e.pendienteDeEtapa}
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={e.clave}>
              <Link
                href={e.ruta}
                /**
                 * **Sin precarga, y no es una micro-optimización.** Las nueve
                 * pantallas son `force-dynamic`: se renderizan por petición
                 * contra la API con la sesión de quien mira, así que precargar
                 * no ahorra nada —el servidor tiene que hacer el trabajo igual—
                 * y en cambio dispara ocho peticiones autenticadas cada vez que
                 * alguien abre cualquier vista.
                 *
                 * Además producía errores reales en el navegador: al cambiar de
                 * página, las precargas en vuelo se abortan y Next las registra
                 * como «Failed to fetch RSC payload». Lo detectó el recorrido
                 * del camino completo, que exige CERO errores de consola.
                 */
                prefetch={false}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'relative flex items-center rounded-boton px-3 py-2.5 text-cuerpo transition-colors',
                  activo
                    ? 'bg-oscuro-elevado font-medium text-texto-invertido'
                    : 'text-texto-invertidoApagado hover:bg-oscuro-secundario hover:text-texto-invertido',
                )}
              >
                {activo ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-0 w-1 rounded-full bg-marca"
                  />
                ) : null}
                {e.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-oscuro-borde px-5 py-4">
        <p className="text-etiqueta uppercase text-texto-invertidoApagado">Sesión</p>
        <p className="mt-1 text-secundario text-texto-invertido">{NOMBRE_DE_ROL[rol]}</p>
      </div>
    </nav>
  );
};
