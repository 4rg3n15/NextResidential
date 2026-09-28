'use client';

import type { JSX } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * BLOQUE I (15-L) · el «!» con una frase de ayuda, en lenguaje de usuario.
 *
 * Sustituye las referencias a reglas y decisiones del proyecto que antes iban
 * en el texto. Es un BOTÓN, no un icono decorativo: se alcanza con el teclado
 * (Tab), la frase aparece al enfocarlo o al pasar el ratón, y en el móvil se
 * abre y se cierra tocándolo. Escape la cierra. El texto está siempre en el
 * árbol de accesibilidad por `aria-describedby`, abierto o no.
 */
export const Ayuda = ({
  texto,
  etiqueta = 'Más información',
}: {
  readonly texto: string;
  readonly etiqueta?: string;
}): JSX.Element => {
  const id = useId();
  const [abierta, setAbierta] = useState(false);
  const [fijada, setFijada] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const visible = abierta || fijada;

  useEffect(() => {
    if (!fijada) return;
    const fuera = (e: PointerEvent): void => {
      if (raiz.current !== null && !raiz.current.contains(e.target as Node)) setFijada(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [fijada]);

  return (
    <span ref={raiz} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={etiqueta}
        aria-describedby={id}
        aria-expanded={visible}
        onClick={() => setFijada((f) => !f)}
        onFocus={() => setAbierta(true)}
        onBlur={() => setAbierta(false)}
        onMouseEnter={() => setAbierta(true)}
        onMouseLeave={() => setAbierta(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setAbierta(false);
            setFijada(false);
          }
        }}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-borde text-distintivo font-bold leading-none text-texto-apagado hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
      >
        !
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-md border border-borde bg-tarjeta px-3 py-2 text-secundario font-normal normal-case tracking-normal text-texto shadow-tarjeta ${visible ? '' : 'sr-only'}`}
      >
        {texto}
      </span>
    </span>
  );
};
