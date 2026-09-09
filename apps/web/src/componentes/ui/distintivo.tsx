import type { JSX } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Distintivo de estado — §5.5 del catálogo, y §5.6.2 del checklist de
 * accesibilidad.
 *
 * **El color nunca es el único portador de significado.** Cada tono lleva su
 * propio icono y su propio texto, así que «Permitido» y «Denegado» se
 * distinguen sin percibir color: por la forma del icono y por la palabra. Es un
 * requisito de AA, y en esta aplicación además es de seguridad — quien vigila
 * una portería no debería depender de un matiz para saber si una puerta se
 * abrió.
 */
export type TonoDeDistintivo = 'exito' | 'peligro' | 'aviso' | 'neutro' | 'marca';

const TONOS: Readonly<Record<TonoDeDistintivo, string>> = {
  exito: 'bg-exito-suave text-exito-texto ring-1 ring-inset ring-exito/20',
  peligro: 'bg-peligro-suave text-peligro-texto ring-1 ring-inset ring-peligro/20',
  aviso: 'bg-aviso-suave text-aviso-texto ring-1 ring-inset ring-aviso/25',
  neutro: 'bg-neutro-suave text-neutro-texto ring-1 ring-inset ring-neutro/20',
  marca: 'bg-marca-suave text-marca-texto ring-1 ring-inset ring-marca/20',
};

/** Los iconos son formas distintas, no el mismo círculo en cuatro colores. */
const ICONOS: Readonly<Record<TonoDeDistintivo, ReactNode>> = {
  exito: (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M6.2 11.2 3.4 8.4l1-1 1.8 1.8 4.4-4.4 1 1z" />
    </svg>
  ),
  peligro: (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M11.5 5.5 9 8l2.5 2.5-1 1L8 9l-2.5 2.5-1-1L7 8 4.5 5.5l1-1L8 7l2.5-2.5z" />
    </svg>
  ),
  aviso: (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M8 2.5 15 14H1zm-.75 4v3.5h1.5V6.5zm0 4.5V12.5h1.5V11z" />
    </svg>
  ),
  neutro: (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M3.5 7.25h9v1.5h-9z" />
    </svg>
  ),
  marca: (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
      fill="currentColor"
    >
      <circle cx="8" cy="8" r="3.5" />
    </svg>
  ),
};

export interface PropiedadesDeDistintivo {
  readonly tono: TonoDeDistintivo;
  readonly children: ReactNode;
  readonly conIcono?: boolean;
  readonly className?: string;
}

export const Distintivo = ({
  tono,
  children,
  conIcono = true,
  className,
}: PropiedadesDeDistintivo): JSX.Element => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-distintivo',
      TONOS[tono],
      className,
    )}
  >
    {conIcono ? ICONOS[tono] : null}
    {children}
  </span>
);

/**
 * Placa en monoespaciada. No es decorativo: evita confundir `0` con `O` y `1`
 * con `I` en el dato que decide una apertura (§5.2).
 */
export const DistintivoDePlaca = ({ placa }: { readonly placa: string }): JSX.Element => (
  <span className="inline-flex items-center rounded-distintivo bg-marca-suave px-2 py-0.5 font-mono text-distintivo tracking-wider text-marca-texto">
    {placa}
  </span>
);
