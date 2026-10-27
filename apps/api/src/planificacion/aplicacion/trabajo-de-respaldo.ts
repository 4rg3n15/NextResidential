import type { Bitacora } from '@ncr/domain-core';
import type { CatalogoDeCopropiedades, TrabajoProgramado } from './puertos';
import { trabajoPorCopropiedad } from './trabajos';

/**
 * D-147 · EL RESPALDO DIARIO DE LOS EVENTOS, COMO TRABAJO PROGRAMADO
 *
 * A las 00:15 de BOGOTÁ (no de UTC) y copropiedad a copropiedad, como el
 * reinicio de aforos: trata el día anterior, recupera los que falten y envía
 * los pendientes. La operación es idempotente (un día con respaldo no se
 * regenera, un envío hecho no se repite), así que un reintento de pg-boss o
 * dos instancias de API en el mismo minuto no duplican nada.
 *
 * Los quince minutos tras la medianoche dejan llegar los eventos que el Edge
 * decidió a las 23:59 y reconcilia después; lo que llegue más tarde que eso no
 * entra en la copia de ese día, pero sigue entero en la aplicación.
 */
export const NOMBRE_DEL_RESPALDO = 'ncr.respaldar-eventos-del-dia';
export const HORARIO_DEL_RESPALDO = '15 0 * * *';
export const ZONA_DEL_TRABAJO_DE_RESPALDO = 'America/Bogota';

/** Lo que el trabajo necesita del caso de uso `RespaldarEventos`, sin importarlo. */
export interface OperacionDeRespaldo {
  ejecutar(
    copropiedadId: string,
    actorId: string,
  ): Promise<{
    readonly generados: number;
    readonly fallidosAlGenerar: number;
    readonly enviados: number;
    readonly fallidosAlEnviar: number;
    readonly sinConfigurar: number;
  }>;
}

export const trabajoDeRespaldoDiario = (
  respaldo: OperacionDeRespaldo,
  actorId: string,
  catalogo: CatalogoDeCopropiedades,
  bitacora: Bitacora,
): TrabajoProgramado => ({
  ...trabajoPorCopropiedad(
    {
      nombre: NOMBRE_DEL_RESPALDO,
      cron: HORARIO_DEL_RESPALDO,
      descripcion:
        'D-147 · guarda en el bucket privado el Excel de los eventos del día anterior (hora ' +
        'de Bogotá) y lo envía a los superadministradores; recupera hasta 31 días perdidos',
      ejecutar: async (copropiedadId) => ({ ...(await respaldo.ejecutar(copropiedadId, actorId)) }),
    },
    catalogo,
    bitacora,
  ),
  zonaHoraria: ZONA_DEL_TRABAJO_DE_RESPALDO,
});
