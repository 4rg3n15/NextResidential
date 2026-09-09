import type { JSX } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sin conexión' };

/**
 * Página que sirve el service worker cuando no hay red.
 *
 * **No muestra datos.** Podría enseñar el último tablero cacheado y parecería
 * más útil; sería mentir: cifras de control de acceso de hace media hora
 * presentadas como actuales llevan a decisiones equivocadas, y en esta consola
 * una decisión equivocada abre o cierra una puerta.
 */
const SinConexion = (): JSX.Element => (
  <main
    id="contenido"
    className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center"
  >
    <h1 className="text-titulo">Sin conexión</h1>
    <p className="max-w-md text-cuerpo text-texto-apagado">
      La consola no puede alcanzar el servidor. No se muestran cifras guardadas: en control de
      acceso, un dato viejo presentado como actual es peor que ningún dato.
    </p>
    <p className="max-w-md text-secundario text-texto-apagado">
      El control de accesos sigue funcionando: el Edge Gateway decide localmente cuando pierde la
      conexión (OE-06) y reconcilia al recuperarla.
    </p>
  </main>
);

export default SinConexion;
