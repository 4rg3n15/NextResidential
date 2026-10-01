import type { Bitacora } from '@ncr/domain-core';
import { motivoSinSecretos } from '../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · BLOQUE 0.1 · LO QUE SE ESCAPA DE TODO `try`
 *
 * La 15-O cerró la vía por la que un corte de PostgreSQL tumbaba la API, pero
 * dejó abierta la familia: un `'error'` o una promesa sin manejar en cualquier
 * otra pieza (una escucha de equipo, un temporizador) seguía siendo, para Node,
 * motivo de muerte instantánea y sin rastro en la bitácora.
 *
 *  · `unhandledRejection` → se REGISTRA y se sigue. Una promesa olvidada es un
 *    defecto que hay que ver, no motivo para dejar sin API a la portería.
 *  · `uncaughtException` → se registra y se CIERRA EN ORDEN (escuchas, latidos,
 *    planificador, pools) con código 1. Después de una excepción sin capturar
 *    el proceso puede estar a medias: seguir sería peor que reiniciar limpio.
 *
 * El texto pasa por `motivoSinSecretos`: nada con `://` (una cadena de
 * conexión dentro de un mensaje de error) llega a la bitácora.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const instalarVigilanciaDelProceso = (
  bitacora: Bitacora,
  cerrar: (motivo: string, codigoAlTerminar: number) => Promise<void>,
  proceso: Pick<NodeJS.Process, 'on'> = process,
): void => {
  proceso.on('unhandledRejection', (motivo: unknown) => {
    bitacora.registrar('error', 'promesa rechazada sin manejar: se registra y la API sigue', {
      detalle: motivoSinSecretos(motivo),
    });
  });
  proceso.on('uncaughtException', (error: Error) => {
    bitacora.registrar('error', 'excepción sin capturar: cierre ordenado', {
      detalle: motivoSinSecretos(error),
      tipo: error.name,
    });
    void cerrar('uncaughtException', 1);
  });
};
