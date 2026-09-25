import type { Bitacora } from '@ncr/domain-core';
import type { CanalTiempoReal } from '../../eventos';
import { TEMA_LLAMADAS } from '../../eventos';
import type { AvisadorDeLlamadas, LlamadaEntrante } from '../aplicacion/puertos';

/**
 * A4 · el aviso de llamada va por el MISMO canal de tiempo real que los
 * eventos y las alertas (SSE, tema `llamadas`), a los suscriptores de ESA
 * copropiedad. Portería y guardia virtual ya están suscritas; no hay un
 * segundo transporte que asegurar ni que medir.
 *
 * Se registra cuántas consolas lo recibieron: una llamada que nadie oyó es
 * exactamente lo que CU-03 quiere que se vea.
 */
export class AvisadorPorCanal implements AvisadorDeLlamadas {
  constructor(
    private readonly canal: CanalTiempoReal,
    private readonly bitacora: Bitacora,
  ) {}

  async llamadaEntrante(llamada: LlamadaEntrante): Promise<void> {
    const entregados = await this.canal.publicar(llamada.copropiedadId, TEMA_LLAMADAS, {
      dispositivoId: llamada.dispositivoId,
      clase: llamada.clase,
      viviendaId: llamada.viviendaId,
      vivienda: llamada.vivienda,
      origen: llamada.origen,
      ocurridoEn: llamada.ocurridoEn.toISOString(),
      referenciaExterna: llamada.referenciaExterna,
    });
    this.bitacora.registrar(
      entregados === 0 ? 'aviso' : 'info',
      'llamada del videoportero avisada',
      {
        copropiedadId: llamada.copropiedadId,
        dispositivoId: llamada.dispositivoId,
        vivienda: llamada.vivienda,
        consolasAvisadas: entregados,
        ...(entregados === 0 ? { motivo: 'ninguna consola suscrita: nadie oyó la llamada' } : {}),
      },
    );
  }
}
