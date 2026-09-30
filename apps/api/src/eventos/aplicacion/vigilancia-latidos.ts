import { Alerta, alertaDeDispositivoCaido, esFallo, estadoPorLatido } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj, UmbralDeLatido } from '@ncr/domain-core';
import type { RepositorioAlertas, RepositorioDispositivos } from './puertos';
import type { EscalarAlerta } from './escalamiento';
import { VENTANA_DE_DUPLICADOS_MS } from './deduplicacion-de-alertas';
import type { AlertasDelCicloDelEquipo } from './alertas-del-ciclo-del-equipo';

export interface ParteDeVigilancia {
  readonly revisados: number;
  readonly caidos: readonly string[];
  readonly degradados: readonly string[];
  readonly alertasAbiertas: number;
}

/**
 * Caso de uso `VigilarLatidos` — CA-26, RN-12, y la mitad de RN-18 que no nace
 * de un evento sino de su ausencia.
 *
 * Es un trabajo programado, no una reacción: un dispositivo caído no genera
 * ningún evento que dispare nada — ese es justamente el problema—. La ETAPA 14
 * lo enganchará a pg-boss; aquí es una operación idempotente que se puede
 * invocar tantas veces como haga falta.
 *
 * **No abre una alerta por cada pasada.** Antes de abrir consulta las abiertas
 * del mismo dispositivo: sin eso, un equipo caído un fin de semana produciría
 * una alerta por minuto y el operador dejaría de mirar la consola, que es la
 * forma habitual de que un sistema de alertas deje de servir.
 */
export class VigilarLatidos {
  constructor(
    private readonly dispositivos: RepositorioDispositivos,
    private readonly alertas: RepositorioAlertas,
    private readonly escalador: EscalarAlerta,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeId,
    private readonly bitacora: Bitacora,
    /** A1 (15-N) · la red de seguridad: lo que late y tenía caída abierta, se resuelve. */
    private readonly ciclo?: Pick<AlertasDelCicloDelEquipo, 'resolverCaida'>,
  ) {}

  async ejecutar(
    copropiedadId: string,
    actorId: string,
    umbral?: UmbralDeLatido,
  ): Promise<ParteDeVigilancia> {
    const ahora = this.reloj.ahora();
    const latidos = await this.dispositivos.latidos(copropiedadId);
    // Otros fallos (15-M) · sólo las de equipo caído: el listado se corta en
    // 200 y, mezclado con el ruido de otros tipos, dejaba fuera las más viejas
    // y cada pasada las duplicaba.
    const abiertas = await this.alertas.abiertasDe(copropiedadId, { tipo: 'dispositivo_caido' });
    const yaAlertados = new Set(abiertas.map((a) => a.dispositivoId));

    const caidos: string[] = [];
    const degradados: string[] = [];
    let alertasAbiertas = 0;

    for (const latido of latidos) {
      const estado = estadoPorLatido(latido.ultimoLatido, ahora, umbral);
      if (estado !== 'caido' && estado !== 'degradado' && yaAlertados.has(latido.dispositivoId)) {
        await this.ciclo?.resolverCaida(copropiedadId, latido.dispositivoId, 'latido', actorId);
        continue;
      }
      if (estado === 'degradado') {
        degradados.push(latido.dispositivoId);
        continue;
      }
      if (estado !== 'caido') continue;

      caidos.push(latido.dispositivoId);
      if (yaAlertados.has(latido.dispositivoId)) continue;
      if (await this.archivadaHacePoco(copropiedadId, latido.dispositivoId, ahora)) continue;

      const descriptor = alertaDeDispositivoCaido(latido.dispositivoId);
      const alerta = Alerta.abrir({
        id: this.ids.nuevo(),
        copropiedadId,
        tipo: descriptor.tipo,
        severidad: descriptor.severidad,
        generadaEn: ahora,
        dispositivoId: latido.dispositivoId,
        notas: descriptor.porQue,
      });
      if (esFallo(alerta)) continue;

      await this.alertas.guardar(alerta.valor, actorId);
      await this.escalador.ejecutar(alerta.valor, actorId);
      alertasAbiertas += 1;
    }

    if (caidos.length > 0 || degradados.length > 0) {
      this.bitacora.registrar('aviso', 'dispositivos fuera de servicio', {
        copropiedadId,
        caidos: caidos.length,
        degradados: degradados.length,
      });
    }

    return { revisados: latidos.length, caidos, degradados, alertasAbiertas };
  }

  /**
   * Otros fallos (15-M) · una alerta de equipo caído que alguien ARCHIVÓ como
   * ruido no se reabre en la pasada siguiente: se respeta la misma ventana de
   * duplicados que las demás alertas de equipo (E5). Una RESUELTA sí vuelve a
   * alertar en cuanto el equipo cae otra vez: resolverla dice que se arregló.
   */
  private async archivadaHacePoco(
    copropiedadId: string,
    dispositivoId: string,
    ahora: Date,
  ): Promise<boolean> {
    const ultima = await this.alertas.ultimaDe(copropiedadId, dispositivoId, 'dispositivo_caido');
    if (ultima === null || !ultima.archivada || ultima.estado === 'resuelta') return false;
    const haceMs = ahora.getTime() - ultima.generadaEn.getTime();
    return haceMs >= 0 && haceMs < VENTANA_DE_DUPLICADOS_MS;
  }
}
