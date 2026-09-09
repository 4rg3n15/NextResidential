import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compone clases resolviendo conflictos de Tailwind.
 *
 * `clsx` decide qué clases entran; `twMerge` resuelve cuál gana cuando dos
 * tocan la misma propiedad. Sin lo segundo, un componente con `px-4` por
 * defecto al que la vista le pasa `px-2` acaba con las dos, y el resultado
 * depende del orden en la hoja compilada — que es una forma muy silenciosa de
 * que el mismo componente se vea distinto en dos pantallas.
 */
export const cn = (...clases: ClassValue[]): string => twMerge(clsx(clases));
