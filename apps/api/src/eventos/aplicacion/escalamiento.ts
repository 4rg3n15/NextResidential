import { PLAZO_ESCALAMIENTO_MS } from '@ncr/domain-core';
import type { Alerta, Bitacora, Reloj } from '@ncr/domain-core';
import type { CanalTiempoReal, NotificadorPush, RepositorioAlertas } from './puertos';
import { TEMA_ALERTAS } from './puertos';

export interface ResultadoEscalamiento {
  readonly alerta: Alerta;
  readonly destinatarios: number;
  readonly latenciaMs: number;
  readonly dentroDelPlazo: boolean;
}

/**
 * Caso de uso `EscalarAlerta` — RN-18, CA-18, KPI-25.
 *
 * **Decisión de diseño que sostiene la prioridad de esta etapa.** El compromiso
 * de los 10 s NO puede depender de que Supabase Realtime esté a la altura. El
 * documento de requisitos señala ese canal como riesgo, y una etapa que
 * construyera el escalamiento *encima* del canal heredaría el riesgo entero:
 * el día que el transporte se degrade, el indicador se cae con él y nadie lo
 * sabe hasta que un evento crítico llega tarde.
 *
 * Aquí el escalamiento es una operación de la aplicación con su propio
 * cronómetro: se publica, se cuenta a cuántos llegó, se sella el instante y se
 * mide contra el plazo del dominio. El transporte es un puerto sustituible, y
 * lo único que cambia al cambiarlo es el número que sale medido.
 *
 * **Cero destinatarios no es un escalamiento.** Publicar en un canal que nadie
 * escucha es exactamente el modo de fallo de CU-03 —«ausencia de operador
 * disponible»—, y contarlo como cumplido convertiría KPI-25 en un indicador que
 * siempre da verde. Cuando ocurre, la alerta se sella igualmente (para no
 * perder el instante) pero se registra el aviso y se dispara el respaldo.
 */
export class EscalarAlerta {
  constructor(
    private readonly canal: CanalTiempoReal,
    private readonly repositorio: RepositorioAlertas,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
    private readonly respaldo?: NotificadorPush,
  ) {}

  async ejecutar(alerta: Alerta, actorId: string): Promise<ResultadoEscalamiento> {
    const destinatarios = await this.publicar(alerta);

    const ahora = this.reloj.ahora();
    const escalada = alerta.escalar(ahora);
    await this.repositorio.guardar(escalada, actorId);

    const latenciaMs = ahora.getTime() - alerta.generadaEn.getTime();
    const dentroDelPlazo = escalada.escaladaDentroDelPlazo() === true && destinatarios > 0;

    this.bitacora.registrar(dentroDelPlazo ? 'info' : 'aviso', 'alerta escalada', {
      alertaId: escalada.id,
      copropiedadId: escalada.copropiedadId,
      tipo: escalada.tipo,
      severidad: escalada.severidad,
      destinatarios,
      latenciaMs,
      plazoMs: PLAZO_ESCALAMIENTO_MS,
      dentroDelPlazo,
    });

    if (destinatarios === 0) await this.avisarSinOperador(escalada);

    return { alerta: escalada, destinatarios, latenciaMs, dentroDelPlazo };
  }

  private async publicar(alerta: Alerta): Promise<number> {
    try {
      return await this.canal.publicar(alerta.copropiedadId, TEMA_ALERTAS, {
        id: alerta.id,
        tipo: alerta.tipo,
        severidad: alerta.severidad,
        generadaEn: alerta.generadaEn.toISOString(),
        eventoId: alerta.eventoId,
        dispositivoId: alerta.dispositivoId,
      });
    } catch (e) {
      // Un transporte caído no puede tumbar la ingesta ni impedir que la alerta
      // quede registrada: el histórico es la garantía que sí controlamos.
      this.bitacora.registrar('error', 'el canal de tiempo real falló al publicar la alerta', {
        alertaId: alerta.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return 0;
    }
  }

  private async avisarSinOperador(alerta: Alerta): Promise<void> {
    this.bitacora.registrar('aviso', 'alerta sin operador conectado (CU-03, flujo alterno)', {
      alertaId: alerta.id,
      copropiedadId: alerta.copropiedadId,
    });
    if (this.respaldo === undefined) return;
    try {
      await this.respaldo.aVivienda(
        alerta.copropiedadId,
        'guardia',
        'Alerta sin operador en central',
        `Alerta ${alerta.tipo} (${alerta.severidad}) sin operador conectado.`,
      );
    } catch (e) {
      this.bitacora.registrar('error', 'el respaldo de escalamiento falló', {
        alertaId: alerta.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
