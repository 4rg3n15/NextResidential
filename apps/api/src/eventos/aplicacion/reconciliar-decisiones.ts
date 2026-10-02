import { VersionDeReglas, negar, permitir } from '@ncr/domain-core';
import type { MotivoAcceso } from '@ncr/domain-core';
import type { RegistrarAcceso } from './registrar-acceso';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ETAPA 12 · CU-04 · LA BANDEJA DEL EDGE, AL RECONECTAR. RN-16, RN-17, CA-21, CA-22
 *
 * Vivía dentro de `IngestaController.reconciliar`. Desde la 15-Q hay dos
 * entradas que la usan —la ruta histórica de la ingesta, firmada con el secreto
 * maestro, y la del Edge acreditado (`edge.controller.ts`)— y la regla tiene que
 * ser una sola: si se separaran, el mismo lote produciría historiales distintos
 * según por dónde entrara.
 *
 * AQUÍ NO SE DECIDE NADA. Cada evento llega con la decisión que el gateway YA
 * tomó, sellada con su `VersionDeReglas` y con el instante real. Volver a
 * evaluarlo con las reglas de hoy borraría la única prueba de qué hizo el Edge
 * durante el corte (CA-21).
 *
 * EN ORDEN Y EN SERIE, y se corta en el primero que falla: los siguientes
 * quedarían escritos antes que él y el orden del histórico dejaría de ser el
 * del corte. El duplicado NO es un fallo: es CA-22 funcionando.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface DecisionReconciliable {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly metodo: 'placa' | 'facial' | 'manual' | 'remoto' | 'tarjeta';
  readonly referenciaExterna: string;
  readonly confianzaCentesimas: number;
  readonly personaId?: string;
  readonly placaLeida?: string;
  readonly zonaId?: string;
  readonly ocurridoEn: string;
  readonly cachePotencialmenteObsoleto?: boolean;
  readonly decision: {
    readonly permitido: boolean;
    readonly motivo?: MotivoAcceso;
    readonly reglaAplicada: string;
    readonly versionDeReglas: number;
    readonly requiereConfirmacionHumana?: boolean;
  };
}

export interface DecisionReconciliada {
  readonly claveIdempotencia: string;
  readonly aceptado: boolean;
  readonly duplicado: boolean;
  readonly detalle?: string;
  /** El acceso de `eventos` que quedó (o que ya estaba). Sólo si se aceptó. */
  readonly eventoId?: string;
}

const rechazo = (detalle: string): DecisionReconciliada => ({
  claveIdempotencia: '',
  aceptado: false,
  duplicado: false,
  detalle,
});

export class ReconciliarDecisiones {
  constructor(
    private readonly registrar: RegistrarAcceso,
    private readonly actorId: string,
  ) {}

  async ejecutar(eventos: readonly DecisionReconciliable[]): Promise<DecisionReconciliada[]> {
    const resultados: DecisionReconciliada[] = [];
    for (const evento of eventos) {
      const resultado = await this.uno(evento);
      resultados.push(resultado);
      if (!resultado.aceptado) break;
    }
    return resultados;
  }

  private async uno(evento: DecisionReconciliable): Promise<DecisionReconciliada> {
    const version = VersionDeReglas.crear(evento.decision.versionDeReglas, evento.copropiedadId);
    if (!version.ok) return rechazo(version.error.detalle);
    // CA-16 · una negación sin motivo no es admisible. El tipo del dominio lo
    // hace imposible; aquí, donde los datos vienen de fuera, se comprueba.
    if (!evento.decision.permitido && evento.decision.motivo === undefined) {
      return rechazo('Una decisión denegada debe traer motivo (CA-16)');
    }
    const decision = evento.decision.permitido
      ? permitir(
          version.valor,
          evento.decision.reglaAplicada,
          evento.decision.requiereConfirmacionHumana ?? false,
        )
      : negar(evento.decision.motivo as MotivoAcceso, version.valor, evento.decision.reglaAplicada);

    const constancia = await this.registrar.ejecutar(
      {
        copropiedadId: evento.copropiedadId,
        dispositivoId: evento.dispositivoId,
        metodo: evento.metodo,
        referenciaExterna: evento.referenciaExterna,
        confianza: evento.confianzaCentesimas / 100,
        personaId: evento.personaId ?? null,
        placaLeida: evento.placaLeida ?? null,
        zonaId: evento.zonaId ?? null,
        decididoPorEdge: true,
        cachePotencialmenteObsoleto: evento.cachePotencialmenteObsoleto ?? false,
        decisionDelEdge: decision,
        ocurridoEn: new Date(evento.ocurridoEn),
      },
      this.actorId,
    );
    if (!constancia.ok) return rechazo(constancia.error.detalle);
    return {
      claveIdempotencia: constancia.valor.claveIdempotencia,
      aceptado: true,
      duplicado: constancia.valor.duplicado,
      eventoId: constancia.valor.eventoId,
    };
  }
}
