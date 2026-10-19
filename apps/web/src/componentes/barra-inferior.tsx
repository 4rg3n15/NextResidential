'use client';

import type { JSX } from 'react';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Rol } from '@ncr/contracts';
import * as Lucide from 'lucide-react';
import { cn } from '@/lib/cn';
import { navegacionDe } from '@/lib/navegacion';
import type { NombreDeIcono } from '@/lib/navegacion';
import { repartirNavegacion, rutaActivaDe } from '@/lib/navegacion-movil';

/**
 * D-71 · LA NAVEGACIÓN EN VERTICAL, EN LA PARTE DE ABAJO
 *
 * La barra lateral se oculta por debajo de 768 px (`hidden md:flex`) y hasta
 * ahora no había nada en su lugar: en vertical la consola se quedaba sin menú
 * y sólo aparecía al girar el teléfono. Esta barra lo cubre, y vive donde el
 * pulgar llega: abajo.
 *
 * Decisiones que conviene no deshacer sin releer esto:
 *
 *  · **Iconos, con su nombre accesible.** A 390 px y seis huecos no cabe una
 *    etiqueta legible, así que el nombre va en `aria-label` y en `title`: para
 *    el lector de pantalla y para quien mantenga el dedo encima. Un icono sin
 *    nombre accesible es un botón mudo.
 *  · **`fixed` y no `sticky`.** Al contrario que en la barra lateral, aquí
 *    interesa justamente sacarla del flujo: debe quedarse quieta mientras la
 *    página se desplaza. El hueco que deja se reserva en `MarcoDeConsola` con
 *    el relleno inferior del `main`.
 *  · **El área segura.** En un iPhone con barra de gestos, los últimos
 *    milímetros de la pantalla no son pulsables: sin `env(safe-area-inset-
 *    bottom)` la fila de iconos queda debajo de la barra del sistema y deja de
 *    responder. Va como clase de Tailwind, no como atributo `style`, que la
 *    CSP de la consola no admite (§2.7.7).
 *  · **El panel «Más» se cierra al navegar.** `usePathname` cambia en cada
 *    navegación y eso lo cierra: si no, el panel quedaría abierto encima de la
 *    pantalla recién abierta.
 */
const IconoDe = ({ nombre }: { readonly nombre: NombreDeIcono }): JSX.Element => {
  const Componente = Lucide[nombre];
  return <Componente aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={1.75} />;
};

export const BarraInferior = ({
  rol,
  className,
}: {
  readonly rol: Rol;
  readonly className?: string;
}): JSX.Element => {
  const rutaActual = usePathname();
  const elementos = navegacionDe(rol);
  const rutaActiva = rutaActivaDe(elementos, rutaActual);
  const { enLaBarra, enMas, activaEnMas } = repartirNavegacion(elementos, rutaActiva);
  const [abierto, setAbierto] = useState(false);
  const idDelPanel = useId();

  // Cerrar al navegar: el panel no debe sobrevivir al cambio de pantalla.
  useEffect(() => setAbierto(false), [rutaActual]);

  // Escape cierra, como cualquier capa sobre el contenido.
  useEffect(() => {
    if (!abierto) return undefined;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto]);

  const claseDeBoton = (activo: boolean): string =>
    cn(
      'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-boton py-2',
      'transition-colors duration-150 ease-out motion-reduce:transition-none',
      activo
        ? 'font-medium text-texto-invertido'
        : 'text-texto-invertidoApagado hover:text-texto-invertido',
    );

  return (
    <>
      {abierto ? (
        <button
          type="button"
          aria-label="Cerrar el menú"
          onClick={() => setAbierto(false)}
          className={cn('fixed inset-0 z-40 bg-oscuro/50 md:hidden', className)}
        />
      ) : null}

      <nav
        aria-label="Navegación principal"
        className={cn(
          'superficie-oscura fixed inset-x-0 bottom-0 z-50 border-t border-oscuro-borde bg-oscuro',
          'pb-[env(safe-area-inset-bottom)]',
          className,
        )}
      >
        {abierto ? (
          <ul
            id={idDelPanel}
            className="max-h-[50dvh] space-y-0.5 overflow-y-auto border-b border-oscuro-borde px-3 py-2"
          >
            {enMas.map((e) => {
              const activo = e.ruta === rutaActiva;
              if (e.pendienteDeEtapa !== null) {
                return (
                  <li key={e.clave}>
                    <span
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center gap-3 rounded-boton px-3 py-3 text-cuerpo text-texto-invertidoApagado opacity-60"
                    >
                      <IconoDe nombre={e.icono} />
                      <span className="flex-1">{e.etiqueta}</span>
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
                    prefetch={false}
                    aria-current={activo ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-boton px-3 py-3 text-cuerpo',
                      activo
                        ? 'bg-oscuro-elevado font-medium text-texto-invertido'
                        : 'text-texto-invertidoApagado',
                    )}
                  >
                    <IconoDe nombre={e.icono} />
                    <span className="flex-1">{e.etiqueta}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        <ul className="flex items-stretch gap-1 px-2 py-1">
          {enLaBarra.map((e) => {
            const activo = e.ruta === rutaActiva;
            return (
              <li key={e.clave} className="flex min-w-0 flex-1">
                <Link
                  href={e.ruta}
                  prefetch={false}
                  aria-label={e.etiqueta}
                  title={e.etiqueta}
                  aria-current={activo ? 'page' : undefined}
                  className={claseDeBoton(activo)}
                >
                  <IconoDe nombre={e.icono} />
                  {/* El filete marca el activo también para quien no distingue
                      el cambio de color, igual que en la barra lateral. */}
                  {/* Siempre dibujado y con la opacidad como única diferencia:
                      aparecer y desaparecer movería los iconos un par de
                      píxeles en cada navegación. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-0.5 w-6 rounded-full bg-marca',
                      activo ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </Link>
              </li>
            );
          })}

          {enMas.length > 0 ? (
            <li className="flex min-w-0 flex-1">
              <button
                type="button"
                aria-label="Más secciones"
                title="Más secciones"
                aria-expanded={abierto}
                aria-controls={idDelPanel}
                onClick={() => setAbierto((x) => !x)}
                className={claseDeBoton(activaEnMas || abierto)}
              >
                <IconoDe nombre="Menu" />
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-0.5 w-6 rounded-full bg-marca',
                    activaEnMas ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
};
