import { esFallo } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { RepositorioAlertas } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A1 (15-N) · LAS ALERTAS QUE NACEN DEL ESTADO DEL EQUIPO SE CIERRAN CON ÉL
 *
 * El 29/09 las alertas «dispositivo caído» del 28 seguían abiertas con los
 * tres equipos en línea: `VigilarLatidos` las abría y nada las cerraba. El
 * recuadro «N alertas sin resolver» y el tablero contaban alarmas de algo que
 * ya no pasaba, que es la forma de que un operador deje de mirarlas.
 *
 *  · `resolverCaida`: cuando vuelve la señal del equipo —su latido, un evento
 *    de su escucha o un sondeo que contesta— sus alertas de caída se
 *    RESUELVEN, con la nota «resuelta automáticamente» y el actor de servicio.
 *    No se borran: quedan en el histórico con cuándo y por qué se cerraron.
 *  · `archivarPorBaja`: dar de baja un equipo archiva sus alertas abiertas con
 *    el motivo de la baja (RN-19: archivo lógico, la fila queda).
 *
 * Ninguna de las dos lanza: el latido y la baja pesan más que sus alertas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const NOTA_DE_RESOLUCION_AUTOMATICA = 'resuelta automáticamente';

export type SenalDeVuelta = 'latido' | 'evento' | 'sondeo';

const EN_PALABRAS: Readonly<Record<SenalDeVuelta, string>> = {
  latido: 'volvió su latido',
  evento: 'volvió a emitir eventos',
  sondeo: 'volvió a contestar al sondeo',
};

export class AlertasDelCicloDelEquipo {
  constructor(
    private readonly alertas: RepositorioAlertas,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
  ) {}

  /** Devuelve cuántas resolvió. */
  async resolverCaida(
    copropiedadId: string,
    dispositivoId: string,
    senal: SenalDeVuelta,
    actorId: string,
  ): Promise<number> {
    try {
      const abiertas = await this.alertas.abiertasDe(copropiedadId, {
        tipo: 'dispositivo_caido',
        dispositivoId,
      });
      if (abiertas.length === 0) return 0;
      const ahora = this.reloj.ahora();
      let resueltas = 0;
      for (const alerta of abiertas) {
        const nota =
          `[${NOTA_DE_RESOLUCION_AUTOMATICA}] el equipo ${EN_PALABRAS[senal]}` +
          (alerta.notas === null ? '' : ` · ${alerta.notas}`);
        const resuelta = alerta.resolver(ahora, nota.slice(0, 500));
        if (esFallo(resuelta)) continue;
        await this.alertas.guardar(resuelta.valor, actorId);
        resueltas += 1;
      }
      this.bitacora.registrar('info', 'alerta de equipo caído resuelta automáticamente', {
        copropiedadId,
        dispositivoId,
        senal,
        resueltas,
      });
      return resueltas;
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo resolver la alerta de equipo caído', {
        dispositivoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /** Devuelve cuántas archivó. */
  async archivarPorBaja(
    copropiedadId: string,
    dispositivoId: string,
    motivo: string,
    actorId: string,
  ): Promise<number> {
    try {
      const abiertas = await this.alertas.abiertasDe(copropiedadId, { dispositivoId });
      if (abiertas.length === 0) return 0;
      return await this.alertas.archivar(
        copropiedadId,
        abiertas.map((a) => a.id),
        `equipo dado de baja: ${motivo}`.slice(0, 500),
        actorId,
        this.reloj.ahora(),
      );
    } catch (error) {
      this.bitacora.registrar(
        'aviso',
        'no se pudieron archivar las alertas del equipo dado de baja',
        {
          dispositivoId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return 0;
    }
  }
}
