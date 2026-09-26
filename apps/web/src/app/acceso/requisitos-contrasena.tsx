import type { JSX } from 'react';
import { cn } from '@/lib/cn';
import { REQUISITOS, requisitosCumplidos } from '@/lib/politica-contrasena';

/**
 * Los cinco requisitos, marcándose en vivo.
 *
 * Se muestran TODOS desde el principio en vez de ir reprochando uno cada vez:
 * decir «falta una mayúscula», y al corregirlo «falta un número», obliga a
 * descubrir la regla a base de intentos.
 *
 * `aria-live="polite"` y no `assertive`: el lector anuncia el cambio al
 * terminar de teclear, sin interrumpir cada pulsación. Y el estado no se
 * transmite solo por color —hay un símbolo y texto—, porque §5.6.2 lo exige y
 * porque el verde y el gris son el mismo gris para quien no distingue el verde.
 *
 * Compartido desde la 15-H por el restablecimiento por enlace y el cambio
 * obligatorio del primer ingreso: la misma regla, la misma lista.
 */
export const RequisitosDeContrasena = ({
  contrasena,
  id,
}: {
  readonly contrasena: string;
  readonly id: string;
}): JSX.Element => {
  const cumplidos = requisitosCumplidos(contrasena);
  return (
    <ul id={id} aria-live="polite" className="space-y-1">
      {REQUISITOS.map((r) => {
        const cumple = cumplidos[r.clave];
        return (
          <li key={r.clave} className="flex items-center gap-2 text-secundario">
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none transition-colors duration-150 motion-reduce:transition-none',
                cumple
                  ? 'border-exito bg-exito-suave text-exito'
                  : 'border-borde text-texto-apagado',
              )}
            >
              {cumple ? '✓' : ''}
            </span>
            <span className={cumple ? 'text-texto' : 'text-texto-apagado'}>
              {r.texto}
              <span className="sr-only">{cumple ? ' · cumplido' : ' · pendiente'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};
