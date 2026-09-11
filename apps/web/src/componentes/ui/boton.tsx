import type { JSX } from 'react';
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Botón — resolución de la tensión «el rojo es marca y es peligro» (§5.1).
 *
 * No se resuelve con dos rojos compitiendo en la misma vista, sino con
 * **fricción**: `primario` y `peligro` comparten relleno, y lo que los separa
 * es que el segundo exige confirmación con motivo obligatorio (RN-08, CA-16).
 * Esa diferencia vive en quien los usa, no en el color.
 *
 * El relleno es `marca.boton` y no `marca.DEFAULT`: con la etiqueta en blanco,
 * el rojo de marca da 4,17 : 1 y AA pide 4,5 para texto normal. Ver el hallazgo
 * en `packages/config/src/tailwind-preset.ts`.
 */
export type VarianteDeBoton = 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'exito';
export type TamanoDeBoton = 'sm' | 'md' | 'lg';

const VARIANTES: Readonly<Record<VarianteDeBoton, string>> = {
  primario: 'bg-marca-boton text-white hover:bg-marca-presionado active:bg-marca-presionado',
  peligro: 'bg-peligro-boton text-white hover:bg-marca-presionado active:bg-marca-presionado',
  exito: 'bg-exito text-white hover:bg-exito-texto active:bg-exito-texto',
  secundario: 'bg-white text-texto border border-borde hover:bg-borde-suave',
  fantasma: 'bg-transparent text-texto-apagado hover:bg-borde-suave hover:text-texto',
};

const TAMANOS: Readonly<Record<TamanoDeBoton, string>> = {
  // 44 px de alto mínimo en `md` y `lg`: §5.6.4 exige ese objetivo táctil, y la
  // consola también se usa en tabletas en la portería.
  sm: 'h-9 px-3 text-secundario gap-1.5',
  md: 'h-11 px-4 text-cuerpo gap-2',
  lg: 'h-12 px-5 text-cuerpo gap-2',
};

export interface PropiedadesDeBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variante?: VarianteDeBoton;
  readonly tamano?: TamanoDeBoton;
  readonly cargando?: boolean;
  readonly anchoCompleto?: boolean;
}

export const Boton = forwardRef<HTMLButtonElement, PropiedadesDeBoton>(function Boton(
  {
    variante = 'primario',
    tamano = 'md',
    cargando = false,
    anchoCompleto = false,
    className,
    children,
    disabled,
    ...resto
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // `aria-busy` y no solo el texto: un lector de pantalla debe saber que la
      // acción está en curso sin depender de que alguien vea el giro.
      aria-busy={cargando}
      disabled={disabled === true || cargando}
      className={cn(
        'inline-flex items-center justify-center rounded-boton font-medium',
        /**
         * **`active:scale-[0.97]` — el botón responde a la pulsación.**
         *
         * Es el detalle que más separa una interfaz que «se siente» de una que
         * solo funciona: sin él, entre pulsar y que ocurra algo no hay ninguna
         * señal de que el sistema oyó. Con él, la confirmación es instantánea
         * aunque la petición tarde.
         *
         * 0,97 y no 0,9: tiene que percibirse, no verse. Se anima `transform`
         * y `colors` —las dos propiedades que la GPU resuelve sin recalcular
         * disposición ni repintar—, nunca `all`.
         *
         * 150 ms con la curva de salida propia: por debajo de 100 no se
         * percibe como movimiento, por encima de 200 el botón parece pastoso.
         */
        'transition-[transform,background-color,color,border-color] duration-150 ease-salida',
        'active:scale-[0.97] disabled:active:scale-100',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        TAMANOS[tamano],
        anchoCompleto && 'w-full',
        className,
      )}
      {...resto}
    >
      {cargando ? <Girador /> : null}
      {children}
    </button>
  );
});

const Girador = (): JSX.Element => (
  <svg
    className="h-4 w-4 animate-spin motion-reduce:animate-none"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path
      className="opacity-90"
      fill="currentColor"
      d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7z"
    />
  </svg>
);
