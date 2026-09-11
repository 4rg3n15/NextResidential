'use client';

import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  CLAVE_ALMACENAMIENTO,
  ETIQUETA_DE_PREFERENCIA,
  NOMBRE_COOKIE,
  PREFERENCIAS,
  VIDA_COOKIE_SEGUNDOS,
  atributoDeTema,
  preferenciaValida,
} from '@/lib/tema';
import type { PreferenciaDeTema } from '@/lib/tema';

/**
 * Conmutador de tema: tres posiciones en un grupo de radio, no un interruptor.
 *
 * **Por qué un grupo de radio y no un botón que cicla.** Un botón que va
 * rotando entre tres estados obliga a pulsar hasta acertar y no dice en qué
 * estado se está sin mirar la pantalla; con radios, el estado actual está
 * marcado, las tres opciones se anuncian y el teclado recorre el grupo con las
 * flechas, que es el comportamiento nativo. Se usa `<input type="radio">` real
 * y no `role="radiogroup"` a mano por lo mismo.
 *
 * **Por qué se pinta vacío en el primer render.** El servidor no sabe qué hay
 * en `localStorage`, así que si pintara una posición marcada podría ser la
 * equivocada y React la corregiría al hidratar: un salto visible justo en el
 * control del tema. Hasta que `useEffect` lee la preferencia real, ninguna
 * posición va marcada — el hueco dura un fotograma y no miente.
 */
const ICONOS: Readonly<Record<PreferenciaDeTema, typeof Sun>> = {
  sistema: Monitor,
  claro: Sun,
  oscuro: Moon,
};

const leerPreferencia = (): PreferenciaDeTema => {
  try {
    return preferenciaValida(window.localStorage.getItem(CLAVE_ALMACENAMIENTO));
  } catch {
    return 'sistema';
  }
};

export const ConmutadorDeTema = (): JSX.Element => {
  const [preferencia, setPreferencia] = useState<PreferenciaDeTema | null>(null);

  useEffect(() => {
    setPreferencia(leerPreferencia());
  }, []);

  const aplicar = useCallback((elegida: PreferenciaDeTema): void => {
    setPreferencia(elegida);

    const raiz = document.documentElement;
    /**
     * La transición se activa sólo durante el cambio y se retira después. Si
     * quedara puesta, cada `:hover` de fila y cada foco de la consola
     * arrastrarían 140 ms de retardo.
     */
    raiz.setAttribute('data-cambiando-tema', '');
    window.setTimeout(() => raiz.removeAttribute('data-cambiando-tema'), 200);

    const atributo = atributoDeTema(elegida);
    if (atributo === undefined) raiz.removeAttribute('data-tema');
    else raiz.setAttribute('data-tema', atributo);

    try {
      window.localStorage.setItem(CLAVE_ALMACENAMIENTO, elegida);
    } catch {
      // Modo privado: la consola sigue funcionando, sólo no recuerda.
    }

    // La cookie existe para que el SERVIDOR pueda poner el atributo en el HTML
    // y no haya destello en la siguiente carga. No es una decisión de
    // seguridad: por eso `SameSite=Lax` y sin `httpOnly` — la escribe el mismo
    // cliente que la usa.
    const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${NOMBRE_COOKIE}=${elegida}; Path=/; Max-Age=${String(VIDA_COOKIE_SEGUNDOS)}; SameSite=Lax${seguro}`;
  }, []);

  return (
    <fieldset
      className="flex items-center gap-0.5 rounded-boton border border-borde bg-lienzo p-0.5"
      aria-label="Tema de la consola"
    >
      <legend className="sr-only">Tema de la consola</legend>
      {PREFERENCIAS.map((opcion) => {
        const Icono = ICONOS[opcion];
        const activa = preferencia === opcion;
        return (
          <label
            key={opcion}
            className={cn(
              'flex h-7 w-7 cursor-pointer items-center justify-center rounded-[0.375rem]',
              'transition-[background-color,color,transform] duration-150 ease-salida',
              'active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100',
              activa
                ? 'bg-tarjeta text-texto shadow-tarjeta'
                : 'text-texto-apagado [@media(hover:hover)and(pointer:fine)]:hover:text-texto',
              'focus-within:ring-2 focus-within:ring-marca-texto focus-within:ring-offset-1 focus-within:ring-offset-lienzo',
            )}
            title={ETIQUETA_DE_PREFERENCIA[opcion]}
          >
            <input
              type="radio"
              name="tema"
              value={opcion}
              checked={activa}
              onChange={() => aplicar(opcion)}
              className="sr-only"
            />
            <Icono className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
            <span className="sr-only">{ETIQUETA_DE_PREFERENCIA[opcion]}</span>
          </label>
        );
      })}
    </fieldset>
  );
};
