import type { Bitacora } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { BovedaDePlantillas, RepositorioPlantillas } from './puertos';

/**
 * C4 (15-M) · `RetirarPlantillasDeEquipo` — la baja de un equipo retira de él
 * TODAS las plantillas que tenía sincronizadas (RN-11): el aparato se queda
 * sin rostros que la plataforma ya no gestiona. La plantilla sigue viva para
 * los demás equipos; sólo se quita de éste.
 *
 * Lo que el equipo no quita —caído, credencial rechazada— queda como estaba
 * (sincronizada en la base) y se cuenta como PENDIENTE: no se da por retirado
 * lo que sigue en el aparato.
 */
export class RetirarPlantillasDeEquipo {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<{ readonly retiradas: number; readonly pendientes: number }> {
    let retiradas = 0;
    let pendientes = 0;
    for (const destino of await this.plantillas.sincronizadasEn(copropiedadId, dispositivoId)) {
      try {
        await this.boveda.retirarDeTerminal(destino.plantillaId, dispositivoId);
        await this.plantillas.registrarRetirada(destino, ctx.usuarioId);
        retiradas += 1;
      } catch (error) {
        pendientes += 1;
        this.bitacora.registrar('aviso', 'baja de equipo: una plantilla no se pudo retirar', {
          dispositivoId,
          plantillaId: destino.plantillaId,
          detalle: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { retiradas, pendientes };
  }
}
