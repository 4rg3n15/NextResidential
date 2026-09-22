import type { Bitacora } from '@ncr/domain-core';
import type { CatalogoDeCopropiedades, TrabajoProgramado } from './puertos';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS TRES TRABAJOS QUE LA ETAPA 14 DEBÍA DAR
 *
 * Las tres operaciones existían desde su etapa, idempotentes y probadas, y
 * **no las invocaba nadie**. Estaban registradas como deuda con ese nombre:
 *
 *   D-31 · `VigilarLatidos` — CA-26. Un dispositivo caído no genera ningún
 *          evento que dispare nada; ese es justamente el problema. Sin
 *          planificador, la terminal se marca caída solo si un humano abre la
 *          pantalla de dispositivos.
 *   D-36 · el reinicio por `cierre_horario` se PROYECTABA al leer y se
 *          persistía al ocupar: una zona que nadie toca en un mes conserva su
 *          fila con el conteo antiguo hasta el siguiente ingreso, y mientras
 *          tanto la consola muestra un aforo que no es.
 *   D-40 · `BarrerPlantillasVencidas` — RN-11 obliga a suprimir el dato
 *          biométrico dentro de las 24 h del vencimiento. Hoy se invocaba por
 *          su ruta HTTP, es decir: se cumplía si alguien se acordaba. Un plazo
 *          legal que depende de que alguien se acuerde no es un plazo.
 *
 * POR QUÉ SE RECORRE COPROPIEDAD A COPROPIEDAD y no con una consulta global:
 * ver `CatalogoDeCopropiedades`. Resumido: el worker usa la llave secreta, que
 * omite la RLS, y §2.7.6 exige que entonces la copropiedad se valide en la capa
 * de aplicación. Pasarla explícitamente a cada caso de uso es esa validación.
 *
 * **UN FALLO EN UNA COPROPIEDAD NO DETIENE LAS DEMÁS.** Es la decisión que más
 * importa de este fichero: sin ella, una copropiedad con una terminal
 * inalcanzable dejaría sin barrer a todas las que vinieran detrás en el bucle
 * —y el incumplimiento de RN-11 sería de todo el sistema, no de una—. El fallo
 * se registra con su copropiedad y el recorrido sigue.
 */
export const HORARIOS = {
  /** Cada cinco minutos: el umbral de latido más corto que admite la configuración. */
  latidos: '*/5 * * * *',
  /** Cada hora en punto: el cierre de jornada de una zona tiene granularidad de minuto. */
  aforos: '0 * * * *',
  /** Cuatro veces al día: RN-11 da 24 h, y un margen de 6 h absorbe una caída. */
  plantillas: '0 */6 * * *',
} as const;

export interface OperacionPorCopropiedad {
  readonly nombre: string;
  readonly cron: string;
  readonly descripcion: string;
  /** Devuelve las cifras de ESA copropiedad. Se suman en el parte. */
  ejecutar(copropiedadId: string): Promise<Readonly<Record<string, number>>>;
}

export const trabajoPorCopropiedad = (
  operacion: OperacionPorCopropiedad,
  catalogo: CatalogoDeCopropiedades,
  bitacora: Bitacora,
): TrabajoProgramado => ({
  nombre: operacion.nombre,
  cron: operacion.cron,
  descripcion: operacion.descripcion,
  async ejecutar(): Promise<Readonly<Record<string, number>>> {
    const copropiedades = await catalogo.activas();
    const total: Record<string, number> = { copropiedades: copropiedades.length, fallidas: 0 };
    for (const copropiedadId of copropiedades) {
      try {
        const parte = await operacion.ejecutar(copropiedadId);
        for (const [clave, valor] of Object.entries(parte)) {
          total[clave] = (total[clave] ?? 0) + valor;
        }
      } catch (error) {
        total.fallidas = (total.fallidas ?? 0) + 1;
        bitacora.registrar('error', 'trabajo programado fallido en una copropiedad', {
          trabajo: operacion.nombre,
          copropiedadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return total;
  },
});
