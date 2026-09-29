import { createServer } from 'node:http';
import type { Server } from 'node:http';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OTROS FALLOS (15-M) · MIENTRAS ARRANCA, LA API CONTESTA 503, NO «CONEXIÓN RECHAZADA»
 *
 * Construir la aplicación —módulos, pools, sondas— tarda segundos, y hasta
 * `listen` el puerto está cerrado: la consola y la app veían «conexión
 * rechazada», indistinguible de una API apagada. Aquí el puerto se abre
 * ANTES, con un servidor mínimo que contesta `503` con `Retry-After` y un
 * motivo en palabras; justo antes de que Nest escuche, se cierra.
 *
 * No atiende nada más: ni rutas, ni cuerpos, ni cabeceras que reflejar. Si el
 * puerto está ocupado no se insiste: el `listen` de Nest dirá por qué.
 *
 * [SUPUESTO] S-158 · `/health` también contesta 503 mientras arranca: para un
 * orquestador es lo mismo que la conexión rechazada de antes (no está lista),
 * y `Retry-After: 2` es el ritmo al que la consola y la app vuelven a pedir.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MENSAJE_ARRANCANDO =
  'La API de Next Control está arrancando: vuelva a intentarlo en unos segundos';

export interface PuertoDeArranque {
  cerrar(): Promise<void>;
}

export const responderMientrasArranca = (servidor: Server): void => {
  servidor.on('request', (_peticion, respuesta) => {
    respuesta.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': '2',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    respuesta.end(
      JSON.stringify({ estado: 503, correlacion: 'api-arrancando', mensaje: MENSAJE_ARRANCANDO }),
    );
  });
};

export const abrirPuertoMientrasArranca = (puerto: number): Promise<PuertoDeArranque | null> =>
  new Promise((listo) => {
    const servidor = createServer();
    responderMientrasArranca(servidor);
    servidor.once('error', () => listo(null));
    servidor.listen(puerto, () =>
      listo({
        cerrar: () =>
          new Promise<void>((cerrado) => {
            servidor.closeAllConnections();
            servidor.close(() => cerrado());
          }),
      }),
    );
  });
