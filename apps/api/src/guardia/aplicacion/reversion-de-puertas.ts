import type { Reloj } from '@ncr/domain-core';
import type { FijarModoDePuerta } from './fijar-modo-de-puerta';
import type { ModoVigente, RegistroDeModosDePuerta } from './modo-de-puerta';
import { tocaRevertir } from './modo-de-puerta';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · P-25 · C3 · EL BARRIDO QUE DEVUELVE LAS PUERTAS A NORMAL
 *
 * Lo invoca un trabajo de pg-boss cada minuto (`ncr.revertir-puertas`): el
 * horario vive en la base de pg-boss y las órdenes vencidas en
 * `ordenes_de_modo_de_puerta`, así que un reinicio de la API no pierde ninguna:
 * el primer barrido tras arrancar revierte lo que venció mientras tanto. Sin
 * pg-boss (`PLANIFICADOR_HABILITADO=false`) lo invoca un temporizador del
 * proceso: una puerta nunca se queda libre porque el motor esté apagado.
 *
 * Una reversión que el equipo o el túnel no aceptan se REINTENTA con espera
 * creciente (1, 2, 4… hasta 30 min, `tocaRevertir`) y levanta una alerta
 * `apertura_fallida` de severidad alta, que se escala (RN-18). La alerta va
 * deduplicada por puerta: un túnel caído una hora no abre sesenta.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** La forma que este módulo necesita del abridor de alertas de `eventos`. */
export interface AlertaDeReversion {
  ejecutar(
    nueva: {
      readonly copropiedadId: string;
      readonly dispositivoId: string;
      readonly tipo: 'apertura_fallida';
      readonly severidad: 'alta';
      readonly clave: string;
      readonly notas: string;
      readonly persistente: boolean;
    },
    actorId: string,
  ): Promise<unknown>;
}

export interface ParteDeReversion {
  readonly vigentes: number;
  readonly revertidas: number;
  readonly fallidas: number;
}

const avisoDe = (v: ModoVigente, detalle: string | null): string =>
  `La puerta ${String(v.numeroDePuerta)} sigue ${v.modo === 'libre' ? 'LIBRE' : 'BLOQUEADA'} ` +
  `desde ${v.ordenadaEn.toISOString()}: la reversión automática no llegó al equipo` +
  `${detalle === null ? '' : ` (${detalle})`}. Se reintenta sola; revísela en la consola.`;

export class BarrerReversionesDePuertas {
  constructor(
    private readonly registro: RegistroDeModosDePuerta,
    private readonly ordenes: FijarModoDePuerta,
    private readonly alertas: AlertaDeReversion,
    private readonly reloj: Reloj,
    private readonly actorId: string,
  ) {}

  async ejecutar(): Promise<ParteDeReversion> {
    const parte = { vigentes: 0, revertidas: 0, fallidas: 0 };
    for (const copropiedadId of await this.registro.copropiedadesConVigentes()) {
      const vigentes = await this.registro.vigentes(copropiedadId);
      parte.vigentes += vigentes.length;
      const ahora = this.reloj.ahora();
      for (const v of vigentes.filter((x) => tocaRevertir(x, ahora))) {
        const r = await this.ordenes.revertirVencida(v, this.actorId);
        if (r.resultado === 'aceptada') {
          parte.revertidas += 1;
          continue;
        }
        parte.fallidas += 1;
        await this.alertas.ejecutar(
          {
            copropiedadId,
            dispositivoId: v.dispositivoId,
            tipo: 'apertura_fallida',
            severidad: 'alta',
            clave: `modo-de-puerta-${String(v.numeroDePuerta)}`,
            notas: avisoDe(v, r.detalle),
            persistente: true,
          },
          this.actorId,
        );
      }
    }
    return parte;
  }
}
