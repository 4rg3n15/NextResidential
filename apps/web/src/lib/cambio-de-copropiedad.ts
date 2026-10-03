import { useEffect, useRef, useState } from 'react';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E1 · H-15K-01 · NINGUNA ESCRITURA MIENTRAS CAMBIA LA COPROPIEDAD
 *
 * El conmutador de la cabecera guarda la elección en el servidor y después
 * recarga el árbol. Entre el clic y el final de la recarga, la pantalla sigue
 * mostrando —y sus formularios siguen enviando— la copropiedad ANTERIOR: un
 * «Guardar» en ese hueco escribía donde el usuario ya no miraba. No cruzaba
 * copropiedades ajenas (la API comprueba el alcance), pero era un error de
 * destino.
 *
 * Mientras dura el cambio, el cliente de la consola retiene toda escritura
 * (POST, PUT, PATCH, DELETE) y la contesta con un 409 legible, sin salir a la
 * red; las lecturas siguen. Al terminar la recarga, la pantalla ya es la nueva.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MENSAJE_CAMBIO_EN_CURSO =
  'La consola está cambiando de copropiedad. Espere a que cargue y vuelva a intentarlo.';

let enCurso = false;

export const cambioDeCopropiedad = {
  iniciar: (): void => {
    enCurso = true;
  },
  terminar: (): void => {
    enCurso = false;
  },
  enCurso: (): boolean => enCurso,
};

/** La respuesta 409 si la petición escribe durante un cambio; `null` si puede salir. */
export const escrituraRetenida = (peticion: Request): Response | null => {
  if (!enCurso || peticion.method === 'GET' || peticion.method === 'HEAD') return null;
  return new Response(
    JSON.stringify({
      estado: 409,
      correlacion: 'cambio-de-copropiedad',
      mensaje: MENSAJE_CAMBIO_EN_CURSO,
    }),
    { status: 409, headers: { 'Content-Type': 'application/json' } },
  );
};

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
