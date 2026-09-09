import type { JSX } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tarjeta. La jerarquía se construye con **borde y fondo**, no con elevación
 * (§5.3): el panel lateral oscuro es el único contraste fuerte de la pantalla y
 * competir con él la emborrona.
 */
export const Tarjeta = ({ className, ...resto }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div
    className={cn('rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta', className)}
    {...resto}
  />
);

export interface PropiedadesDeCabecera {
  readonly titulo: string;
  readonly descripcion?: string;
  readonly accion?: ReactNode;
  readonly className?: string;
}

export const CabeceraDeTarjeta = ({
  titulo,
  descripcion,
  accion,
  className,
}: PropiedadesDeCabecera): JSX.Element => (
  <div className={cn('flex items-start justify-between gap-4 px-5 py-4', className)}>
    <div className="min-w-0">
      <h2 className="text-seccion text-texto">{titulo}</h2>
      {descripcion !== undefined ? (
        <p className="mt-0.5 text-secundario text-texto-apagado">{descripcion}</p>
      ) : null}
    </div>
    {accion}
  </div>
);

export const CuerpoDeTarjeta = ({
  className,
  ...resto
}: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn('px-5 pb-5', className)} {...resto} />
);
