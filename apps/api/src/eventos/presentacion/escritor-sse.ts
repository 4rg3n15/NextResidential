import type { Response } from 'express';
import type { CanalEnProceso } from '../infraestructura/canal-en-proceso';

/** Cada cuánto se escribe el comentario que mantiene viva la conexión (D-67). */
export const LATIDO_SSE_MS = 20_000;

/**
 * El flujo SSE de una copropiedad sobre una respuesta HTTP. Lo comparten el
 * flujo por el proxy de la consola (`eventos.controller.ts`, con sesión) y el
 * DIRECTO con billete (`flujo-directo.controller.ts`, 15-R D1).
 *
 * Con `vidaMs`, el flujo se cierra al cumplirla: el directo no tiene token que
 * caduque a mitad, así que se le pone el mismo límite que tendría la sesión, y
 * la consola reabre con un billete NUEVO —que exige una sesión vigente—.
 *
 * ── D-67 · EL LATIDO, Y POR QUÉ NO ES OPCIONAL ──────────────────────────────
 *
 * Reportado desde el despliegue en Windows: tras unos minutos en pie, la
 * consola escupía `failed to pipe response` con
 * `UND_ERR_BODY_TIMEOUT`, una y otra vez.
 *
 * La causa: este flujo escribía `event: listo` al abrir y **después nada hasta
 * que hubiera un evento**. En una copropiedad tranquila pasan minutos sin un
 * solo byte, y el `fetch` de Node (undici) aborta el cuerpo de una respuesta
 * a los **300 s** por omisión. El canal moría, la consola reconectaba, y
 * vuelta a empezar cada cinco minutos.
 *
 * Un comentario SSE —una línea que empieza por `:`— es la forma que define el
 * estándar para esto: el navegador lo ignora, pero **son bytes**, y bytes es
 * lo único que entiende un intermediario para no dar la conexión por muerta.
 *
 * Se arregla AQUÍ y no solo subiendo el plazo del proxy porque el proxy de la
 * consola no es el único intermediario: un túnel, un balanceador o un proxy
 * inverso cortan igual una conexión ociosa, y ninguno de ellos lee nuestro
 * código. El latido protege todos los caminos a la vez.
 */
export const abrirFlujoSse = (
  respuesta: Response,
  canal: CanalEnProceso,
  copropiedadId: string,
  vidaMs?: number,
  latidoMs = LATIDO_SSE_MS,
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

  /**
   * 20 s: cómodamente por debajo de los 300 s de undici y de los plazos
   * habituales de un túnel o un proxy inverso (30-60 s), y lo bastante
   * espaciado para no pesar — son dos bytes cada vez.
   */
  const latido = setInterval(() => {
    if (respuesta.writableEnded) return;
    respuesta.write(':\n\n');
  }, latidoMs);
  latido.unref();

  const fin = vidaMs === undefined ? null : setTimeout(() => respuesta.end(), vidaMs);
  fin?.unref();
  respuesta.on('close', () => {
    clearInterval(latido);
    if (fin !== null) clearTimeout(fin);
    baja();
    respuesta.end();
  });
};
