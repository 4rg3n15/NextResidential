import type { Response } from 'express';
import type { CanalEnProceso } from '../infraestructura/canal-en-proceso';

/**
 * El flujo SSE de una copropiedad sobre una respuesta HTTP. Lo comparten el
 * flujo por el proxy de la consola (`eventos.controller.ts`, con sesión) y el
 * DIRECTO con billete (`flujo-directo.controller.ts`, 15-R D1).
 *
 * Con `vidaMs`, el flujo se cierra al cumplirla: el directo no tiene token que
 * caduque a mitad, así que se le pone el mismo límite que tendría la sesión, y
 * la consola reabre con un billete NUEVO —que exige una sesión vigente—.
 */
export const abrirFlujoSse = (
  respuesta: Response,
  canal: CanalEnProceso,
  copropiedadId: string,
  vidaMs?: number,
): void => {
  respuesta.setHeader('Content-Type', 'text/event-stream');
  respuesta.setHeader('Cache-Control', 'no-cache, no-transform');
  respuesta.setHeader('Connection', 'keep-alive');
  // Sin esto, un proxy con búfer acumula los mensajes y los entrega en
  // bloque: la latencia medida sería la del búfer, no la del sistema.
  respuesta.setHeader('X-Accel-Buffering', 'no');
  respuesta.flushHeaders();

  const baja = canal.suscribir(copropiedadId, {
    entregar: (tema, carga) => {
      if (respuesta.writableEnded) return false;
      respuesta.write(`event: ${tema}\ndata: ${JSON.stringify(carga)}\n\n`);
      return true;
    },
  });

  respuesta.write(`event: listo\ndata: {"copropiedadId":"${copropiedadId}"}\n\n`);
  const fin = vidaMs === undefined ? null : setTimeout(() => respuesta.end(), vidaMs);
  fin?.unref();
  respuesta.on('close', () => {
    if (fin !== null) clearTimeout(fin);
    baja();
    respuesta.end();
  });
};
