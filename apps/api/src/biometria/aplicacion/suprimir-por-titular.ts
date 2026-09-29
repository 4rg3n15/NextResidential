import type { ContextoTenant } from '../../autenticacion';
import type { BovedaDePlantillas, RepositorioPlantillas } from './puertos';

/**
 * C9 (15-M) · `SuprimirPlantillasDeTitular` — RN-11 cuando el TITULAR deja
 * de existir para la copropiedad (baja de un residente).
 *
 * La revocación de un consentimiento suprime las plantillas de ESE
 * consentimiento; el barrido, las vencidas. Ninguno cubría el caso «esta
 * persona ya no vive aquí»: sus plantillas seguían vivas en la base y en las
 * terminales hasta vencer. Esto las suprime todas —vector borrado, fila
 * marcada, terminal olvidada— y deja la retirada de las terminales al mismo
 * barrido de CA-10 que ya existe (`porRetirar` se deriva del estado).
 *
 * No toca el consentimiento: revocarlo es un acto del titular (RN-10); la
 * supresión por baja es un acto de la copropiedad y queda como tal.
 */
export interface ResultadoDeSupresionPorTitular {
  readonly suprimidas: number;
  readonly yaSuprimidas: number;
}

export class SuprimirPlantillasDeTitular {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: { ahora(): Date },
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    titularId: string,
  ): Promise<ResultadoDeSupresionPorTitular> {
    const ahora = this.reloj.ahora();
    let suprimidas = 0;
    let yaSuprimidas = 0;
    for (const p of await this.plantillas.deTitular(copropiedadId, titularId)) {
      if (p.suprimida) {
        yaSuprimidas += 1;
        continue;
      }
      await this.boveda.olvidar(copropiedadId, p.id);
      await this.plantillas.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
      await this.plantillas.guardar(p.suprimirPorRevocacion(ahora), ctx.usuarioId);
      suprimidas += 1;
    }
    return { suprimidas, yaSuprimidas };
  }
}
