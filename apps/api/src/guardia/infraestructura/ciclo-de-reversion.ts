import { Inject, Injectable } from '@nestjs/common';
import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { PLANIFICADOR } from '../../planificacion';
import type { Planificador } from '../../planificacion';
import { BarrerReversionesDePuertas } from '../aplicacion/reversion-de-puertas';

/** Cada minuto: una puerta libre se pasa, como mucho, un minuto de su plazo. */
export const HORARIO_DE_REVERSION = '* * * * *';
/** Sin pg-boss, el temporizador del proceso, con el mismo margen. */
export const INTERVALO_SIN_PLANIFICADOR_MS = 30_000;

/**
 * 15-R · P-25 · C3 · quién invoca el barrido de reversión.
 *
 * Con pg-boss: un trabajo programado (`ncr.revertir-puertas`) que el
 * planificador da de alta junto a los de mantenimiento —el horario persiste en
 * su base y sobrevive al reinicio—. El planificador se resuelve con `ModuleRef`
 * (`strict: false`), como los barridos de la planificación: va el último en
 * `app.module.ts` y este módulo no puede importarlo sin crear otra instancia.
 *
 * Sin pg-boss (`PLANIFICADOR_HABILITADO=false`, el banco de pruebas, el
 * portátil en sitio) el planificador es inerte y NO ejecutaría nada: entonces
 * barre un temporizador del proceso. La puerta se revierte igual.
 */
@Injectable()
export class CicloDeReversionDePuertas
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private temporizador: NodeJS.Timeout | undefined;

  constructor(
    @Inject(BarrerReversionesDePuertas) private readonly barrer: BarrerReversionesDePuertas,
    @Inject(ModuleRef) private readonly referencia: ModuleRef,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  onApplicationBootstrap(): void {
    let planificador: Planificador | null = null;
    try {
      planificador = this.referencia.get<Planificador>(PLANIFICADOR, { strict: false });
    } catch {
      planificador = null;
    }
    planificador?.programar({
      nombre: 'ncr.revertir-puertas',
      cron: HORARIO_DE_REVERSION,
      descripcion:
        'P-25 · devuelve a su modo normal la puerta libre o bloqueada cuyo plazo venció; ' +
        'reintenta con espera creciente y alerta si el equipo no lo acepta',
      ejecutar: async () => ({ ...(await this.barrer.ejecutar()) }),
    });
    if (planificador !== null && planificador.estado().fase !== 'inerte') return;
    this.temporizador = setInterval(
      () => void this.barrerSinLanzar(),
      INTERVALO_SIN_PLANIFICADOR_MS,
    );
    this.temporizador.unref();
    this.bitacora.registrar('aviso', 'reversión de puertas por temporizador del proceso', {
      motivo: 'sin pg-boss: el planificador está inerte',
      intervaloMs: INTERVALO_SIN_PLANIFICADOR_MS,
    });
  }

  beforeApplicationShutdown(): void {
    if (this.temporizador !== undefined) clearInterval(this.temporizador);
  }

  private async barrerSinLanzar(): Promise<void> {
    try {
      await this.barrer.ejecutar();
    } catch (error) {
      this.bitacora.registrar('error', 'el barrido de reversión de puertas falló', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
