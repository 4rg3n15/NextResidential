import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { CanalTiempoReal } from '../../eventos';
import { TEMA_VISITAS } from './puertos';
import type { ConsultaDeVisitas, VisitaListada } from './puertos';

/** Lo que viaja por el canal en vivo: qué pasó y la visita tal como se lista. */
export interface AvisoDeVisita {
  readonly tipo: 'nueva' | 'anulada';
  readonly visita: VisitaListada;
}

/**
 * F2 (15-L) · el aviso en tiempo real a portería y superadministración.
 *
 * Nunca falla hacia fuera: la visita ya quedó generada o anulada, y que nadie
 * esté mirando la consola —o que el canal tenga un mal momento— no la deshace.
 * Lo que no llegó queda en la bitácora; la lista de la consola se refresca
 * igual al abrirla.
 */
export class AvisoDeVisitas {
  constructor(
    private readonly canal: CanalTiempoReal,
    private readonly consulta: ConsultaDeVisitas,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
  ) {}

  nueva(copropiedadId: string, autorizacionId: string): Promise<number> {
    return this.publicar('nueva', copropiedadId, autorizacionId);
  }

  anulada(copropiedadId: string, autorizacionId: string): Promise<number> {
    return this.publicar('anulada', copropiedadId, autorizacionId);
  }

  private async publicar(
    tipo: AvisoDeVisita['tipo'],
    copropiedadId: string,
    autorizacionId: string,
  ): Promise<number> {
    try {
      const visita = await this.consulta.porId(copropiedadId, autorizacionId, this.reloj.ahora());
      if (visita === null) return 0;
      const aviso: AvisoDeVisita = { tipo, visita };
      return await this.canal.publicar(copropiedadId, TEMA_VISITAS, aviso);
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo avisar de la visita en vivo', {
        copropiedadId,
        autorizacionId,
        tipo,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}
