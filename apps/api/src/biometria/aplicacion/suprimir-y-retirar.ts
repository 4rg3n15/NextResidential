import type { Bitacora } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { BovedaDePlantillas, RepositorioPlantillas } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · SUPRIMIR Y RETIRAR YA — RN-11, CA-11, CA-10
 *
 * La revocación (`RevocarConsentimiento`, A3 de la 15-E) ya suprimía y retiraba
 * de las terminales en el acto. Tres caminos no: el rostro de un residente que
 * se REEMPLAZA, el que se RETIRA sin consentimiento vigente que revocar, y el
 * del menor dado de BAJA (15-W D4), que `SuprimirPlantillasDeTitular` suprime
 * en la base y deja al barrido de 6 h — seis horas en que la terminal sigue
 * reconociendo a quien ya no debe. Esto hace lo mismo que la revocación, sin
 * tocar el consentimiento: vector borrado, fila suprimida y, equipo por equipo,
 * la retirada. El que no responde queda en la cola derivada de CA-10 (no se da
 * por retirado lo que sigue en el aparato) y el barrido lo reintenta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResultadoDeSupresionInmediata {
  readonly suprimidas: number;
  readonly retiradas: number;
  readonly retiradasPendientes: number;
}

export class SuprimirYRetirarYa {
  constructor(
    private readonly repo: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: { ahora(): Date },
    private readonly bitacora: Bitacora,
  ) {}

  /** Las plantillas nombradas, y sólo ellas. */
  async plantillas(
    ctx: ContextoTenant,
    copropiedadId: string,
    plantillaIds: readonly string[],
  ): Promise<ResultadoDeSupresionInmediata> {
    const ids = new Set(plantillaIds);
    let suprimidas = 0;
    for (const id of ids) {
      if (await this.suprimir(ctx, copropiedadId, id)) suprimidas += 1;
    }
    return { suprimidas, ...(await this.retirar(ctx, copropiedadId, ids)) };
  }

  /** Todas las de un titular: la baja de la persona en la copropiedad. */
  async deTitular(
    ctx: ContextoTenant,
    copropiedadId: string,
    titularId: string,
  ): Promise<ResultadoDeSupresionInmediata> {
    const suyas = await this.repo.deTitular(copropiedadId, titularId);
    return this.plantillas(
      ctx,
      copropiedadId,
      suyas.map((p) => p.id),
    );
  }

  private async suprimir(ctx: ContextoTenant, copropiedadId: string, id: string): Promise<boolean> {
    const p = await this.repo.porId(copropiedadId, id);
    if (p === null || p.suprimida) return false;
    await this.boveda.olvidar(copropiedadId, p.id);
    await this.repo.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
    await this.repo.guardar(p.suprimirPorRevocacion(this.reloj.ahora()), ctx.usuarioId);
    return true;
  }

  private async retirar(
    ctx: ContextoTenant,
    copropiedadId: string,
    ids: ReadonlySet<string>,
  ): Promise<Omit<ResultadoDeSupresionInmediata, 'suprimidas'>> {
    let retiradas = 0;
    let retiradasPendientes = 0;
    if (ids.size === 0) return { retiradas, retiradasPendientes };
    for (const destino of await this.repo.porRetirar(copropiedadId)) {
      if (!ids.has(destino.plantillaId)) continue;
      try {
        await this.boveda.retirarDeTerminal(destino.plantillaId, destino.dispositivoId);
        await this.repo.registrarRetirada(destino, ctx.usuarioId);
        retiradas += 1;
      } catch (error) {
        retiradasPendientes += 1;
        this.bitacora.registrar('aviso', 'una plantilla suprimida no se pudo retirar del equipo', {
          dispositivoId: destino.dispositivoId,
          plantillaId: destino.plantillaId,
          detalle: error instanceof Error ? error.message : String(error),
          consecuencia: 'queda en la cola de retirada (CA-10); el barrido la reintenta',
        });
      }
    }
    return { retiradas, retiradasPendientes };
  }
}
