import type { ContextoTenant } from '../../autenticacion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C4 (15-M) · AL DAR DE BAJA UN EQUIPO, SUS ROSTROS SALEN DE ÉL (RN-11)
 *
 * La baja es lógica (RN-19) pero el aparato sigue ahí, con las plantillas que
 * la plataforma le sincronizó. Si nadie las retira, quedan en un equipo que la
 * plataforma ya no gestiona: el dato biométrico sin nadie que responda por él.
 *
 * El puerto lo declara quien lo consume (§2.2): este módulo no importa
 * biometría (biometría ya importa equipos). Lo satisface biometría y se
 * resuelve en la baja; si el equipo no contesta, lo no retirado se DECLARA
 * pendiente con su número, en la respuesta y en la auditoría.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResultadoDeRetiroDePlantillas {
  readonly retiradas: number;
  /** Seguían sincronizadas y el equipo no las quitó: se dicen, no se callan. */
  readonly pendientes: number;
}

export interface RetiroDePlantillasDeEquipo {
  ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<ResultadoDeRetiroDePlantillas>;
}

export const RETIRO_DE_PLANTILLAS_DE_EQUIPO = Symbol.for('ncr.puerto.RetiroDePlantillasDeEquipo');
