'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Rol } from '@ncr/contracts';
import * as Lucide from 'lucide-react';
import { cn } from '@/lib/cn';
import { NOMBRE_DE_ROL, navegacionDe } from '@/lib/navegacion';
import type { NombreDeIcono } from '@/lib/navegacion';

/**
 * Resolución del icono por nombre. El tipo `NombreDeIcono` ya garantiza que
 * existe, así que esto no puede quedarse en `undefined` en tiempo de ejecución:
 * un nombre mal escrito no compila.
 */
const IconoDe = ({ nombre }: { readonly nombre: NombreDeIcono }): JSX.Element => {
  const Componente = Lucide[nombre];
  return (
    <Componente aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
  );
};

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
 *
 * **El defecto de desplazamiento (09-B).** La barra se quedaba arriba mientras
 * el contenido bajaba, así que en las pantallas largas —eventos, viviendas— el
 * operador perdía la navegación entera y tenía que subir del todo para cambiar
 * de sección. La causa: la barra vivía dentro del flujo normal, con la altura
 * de su contenido.
 *
 * Ahora es `sticky` a la altura de la ventana, con la LISTA desplazándose por
 * dentro: el bloque de marca y el pie de sesión quedan siempre visibles y, si
 * los elementos no caben —pantalla baja, zoom alto—, es la lista la que se
 * desplaza y no la página. `position: sticky` y no `fixed` a propósito: `fixed`
 * la saca del flujo y obliga a reservarle un hueco con un margen que hay que
 * mantener sincronizado a mano con su anchura.
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
      className={cn(
        /**
         * `self-start` es imprescindible y no cosmético: dentro de un
         * contenedor flex, el valor por defecto `align-items: stretch` estira
         * este elemento hasta la altura del contenedor, y un elemento tan alto
         * como su contenedor **nunca puede pegarse**: `sticky` no tiene margen
         * por el que desplazarse. Con `self-start` conserva su `h-dvh` y se
         * pega de verdad.
         */
        // El filete derecho no es decorativo: en tema claro el panel oscuro se
        // recorta solo contra el lienzo, pero en oscuro lienzo y panel quedan a
        // un paso de luminancia y sin él la consola pierde su estructura de
        // planos.
        'superficie-oscura sticky top-0 flex h-dvh w-lateral shrink-0 flex-col self-start border-r border-oscuro-borde bg-oscuro',
        className,
      )}
    >
      <div className="shrink-0 px-5 py-5">
        <p className="text-seccion font-bold text-texto-invertido">Next Control</p>
        <p className="text-etiqueta uppercase text-texto-invertidoApagado">Residencial</p>
      </div>

      {/* `min-h-0` es lo que permite que este hijo de un contenedor flex se
          encoja y desplace por dentro. Sin él, el contenido lo estira y el
          desbordamiento vuelve a la página — que es el defecto de partida. */}
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {elementos.map((e) => {
          const activo = rutaActual === e.ruta || rutaActual.startsWith(`${e.ruta}/`);
          const disponible = e.pendienteDeEtapa === null;

          if (!disponible) {
            return (
              <li key={e.clave}>
                <span
                  aria-disabled="true"
                  title={`Se construye en la ETAPA ${e.pendienteDeEtapa}`}
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-boton px-3 py-2.5 text-cuerpo text-texto-invertidoApagado opacity-60"
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
                  /**
                   * 150 ms y `ease-out` en el color: el cambio acompaña al
                   * cursor sin llamar la atención. `ease-out` porque arranca
                   * rápido y frena al final, que es como se percibe una
                   * respuesta inmediata; `ease-in` en una entrada haría que
                   * pareciera que el menú tarda en reaccionar.
                   *
                   * `motion-reduce:transition-none` no es un añadido opcional:
                   * quien pidió movimiento reducido lo pidió para todo.
                   */
                  'group relative flex items-center gap-2.5 rounded-boton px-3 py-2.5 text-cuerpo transition-colors duration-150 ease-out motion-reduce:transition-none',
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
                <IconoDe nombre={e.icono} />
                <span className="flex-1">{e.etiqueta}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 border-t border-oscuro-borde px-5 py-4">
        <p className="text-etiqueta uppercase text-texto-invertidoApagado">Sesión</p>
        <p className="mt-1 text-secundario text-texto-invertido">{NOMBRE_DE_ROL[rol]}</p>
      </div>
    </nav>
  );
};
