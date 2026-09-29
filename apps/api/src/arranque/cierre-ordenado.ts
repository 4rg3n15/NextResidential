import type { Bitacora } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OTROS FALLOS (15-M) · CIERRE ORDENADO CON SIGINT / SIGTERM
 *
 * `enableShutdownHooks` de Nest llama a `app.close()`, que espera a que el
 * servidor HTTP cierre, y el servidor no cierra mientras haya conexiones
 * abiertas: las de tiempo real (SSE) de la consola no terminan nunca. En sitio,
 * Ctrl+C dejaba el proceso colgado con los pools abiertos. Aquí:
 *
 *  1. primera señal → se cortan las conexiones abiertas (SSE incluidas) y se
 *     cierra la aplicación: los ganchos de cada módulo detienen escuchas,
 *     latidos y el planificador, y el pool de PostgreSQL se cierra el último;
 *  2. si en `plazoMs` no terminó, se sale igual y se dice;
 *  3. una segunda señal sale en el acto (código 130, el de Ctrl+C).
 *
 * [SUPUESTO] S-159 · 10 s de plazo: cabe el barrido en curso del planificador
 * (6 s, `PLAZO_DE_PARADA_MS`) y queda por debajo de los 30 s con que un
 * orquestador suele pasar de SIGTERM a SIGKILL.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CerrablePorSenal {
  close(): Promise<void>;
  getHttpServer(): { closeAllConnections?: () => void };
}

export const PLAZO_DE_CIERRE_MS = 10_000;

export const instalarCierreOrdenado = (
  app: CerrablePorSenal,
  bitacora: Bitacora,
  opciones: {
    readonly plazoMs?: number;
    readonly salir?: (codigo: number) => void;
    readonly proceso?: Pick<NodeJS.Process, 'on'>;
  } = {},
): ((senal: string) => Promise<void>) => {
  const salir = opciones.salir ?? ((codigo: number) => process.exit(codigo));
  const plazoMs = opciones.plazoMs ?? PLAZO_DE_CIERRE_MS;
  let cerrando = false;

  const alRecibir = async (senal: string): Promise<void> => {
    if (cerrando) {
      bitacora.registrar('aviso', 'segunda señal: se sale sin esperar', { senal });
      salir(130);
      return;
    }
    cerrando = true;
    bitacora.registrar('info', 'cerrando la API', { senal, plazoMs });
    const vigilante = setTimeout(() => {
      bitacora.registrar('error', 'el cierre no terminó a tiempo: se sale igual', { plazoMs });
      salir(1);
    }, plazoMs);
    vigilante.unref();
    try {
      // Las conexiones que no terminan solas (SSE) no pueden retener el cierre.
      app.getHttpServer().closeAllConnections?.();
      await app.close();
      bitacora.registrar('info', 'API cerrada: escuchas, latidos y pools terminados', { senal });
      clearTimeout(vigilante);
      salir(0);
    } catch (error) {
      clearTimeout(vigilante);
      bitacora.registrar('error', 'fallo al cerrar la API', {
        detalle: error instanceof Error ? error.message : String(error),
      });
      salir(1);
    }
  };

  const proceso = opciones.proceso ?? process;
  for (const senal of ['SIGINT', 'SIGTERM'] as const) {
    proceso.on(senal, () => void alRecibir(senal));
  }
  return alRecibir;
};
