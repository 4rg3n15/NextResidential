'use client';

import { useEffect, useRef, useState } from 'react';
import { cambioDeCopropiedad } from './cambio-de-copropiedad';

/**
 * El estado del cambio para el conmutador: empieza en el clic, termina al
 * acabar la recarga del árbol (`pendiente` de la transición vuelve a falso) o
 * al fallar el guardado de la elección.
 */
export const usarCambioDeCopropiedad = (
  pendiente: boolean,
): {
  readonly cambiando: boolean;
  readonly empezar: () => void;
  readonly fallar: () => void;
  readonly recargar: () => void;
} => {
  const [cambiando, setCambiando] = useState(false);
  const recargando = useRef(false);
  useEffect(() => {
    if (pendiente || !recargando.current) return;
    recargando.current = false;
    cambioDeCopropiedad.terminar();
    setCambiando(false);
  }, [pendiente]);
  return {
    cambiando,
    empezar: () => {
      setCambiando(true);
      cambioDeCopropiedad.iniciar();
    },
    fallar: () => {
      cambioDeCopropiedad.terminar();
      setCambiando(false);
    },
    recargar: () => {
      recargando.current = true;
    },
  };
};
