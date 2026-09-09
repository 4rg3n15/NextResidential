'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Campo de formulario con etiqueta, error y ayuda **asociados por id**.
 *
 * `aria-describedby` y `aria-invalid` no son adorno: sin ellos, un lector de
 * pantalla anuncia «campo de texto» y nada más, y el usuario no se entera de
 * que hay un error justo debajo. Los identificadores se generan con `useId`
 * para que dos instancias del mismo campo en una página no colisionen.
 */
export interface PropiedadesDeCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly etiqueta: string;
  readonly error?: string | undefined;
  readonly ayuda?: string | undefined;
  readonly sufijo?: ReactNode;
}

export const Campo = forwardRef<HTMLInputElement, PropiedadesDeCampo>(function Campo(
  { etiqueta, error, ayuda, sufijo, className, ...resto },
  ref,
) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const descritoPor = [error !== undefined ? idError : null, ayuda !== undefined ? idAyuda : null]
    .filter((x): x is string => x !== null)
    .join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-secundario font-medium text-texto">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={error !== undefined}
          aria-describedby={descritoPor === '' ? undefined : descritoPor}
          className={cn(
            'h-11 w-full rounded-campo border bg-white px-3 text-cuerpo text-texto',
            'placeholder:text-texto-apagado',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:bg-borde-suave',
            error === undefined ? 'border-borde' : 'border-peligro-texto',
            sufijo !== undefined && 'pr-11',
            className,
          )}
          {...resto}
        />
        {sufijo !== undefined ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{sufijo}</div>
        ) : null}
      </div>
      {ayuda !== undefined ? (
        <p id={idAyuda} className="text-secundario text-texto-apagado">
          {ayuda}
        </p>
      ) : null}
      {error !== undefined ? (
        // `role="alert"` para que el error se anuncie al aparecer, no solo
        // cuando el foco vuelva al campo.
        <p id={idError} role="alert" className="text-secundario text-peligro-texto">
          {error}
        </p>
      ) : null}
    </div>
  );
});
