import type { ConsentimientoBiometrico, PlantillaBiometrica } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · LOS PUERTOS DEL ROSTRO DEL RESIDENTE (D2 y D3)
 *
 *  · `LecturaDeRostros` — la plantilla VIVA de residente de una persona (a lo
 *    sumo una, `plantillas_residente_viva_uk`), en qué equipos está, qué queda
 *    por retirar y cuándo capturó una cuenta en las últimas 24 h (el tope se
 *    cuenta en la base, no en memoria). Nunca el vector.
 *  · `ReemplazoDeRostro` — el alta en UNA transacción: el consentimiento, la
 *    anterior a `pendiente_supresion` y la nueva dentro, o nada. Optimista: si
 *    la anterior ya no es la que se leyó al empezar, o si otro registro dejó
 *    antes su consentimiento o su plantilla —otro registro ganó—, no se toca
 *    nada (`consent_vigente_uk` y `plantillas_residente_viva_uk`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type EstadoEnEquipo = 'sincronizada' | 'pendiente' | 'fallida';

export interface PlantillaViva {
  readonly plantillaId: string;
  readonly calidad: number;
  readonly registradoEn: Date;
  readonly venceEn: Date;
}

export interface LecturaDeRostros {
  vivaDe(copropiedadId: string, personaId: string): Promise<PlantillaViva | null>;
  enEquipos(
    copropiedadId: string,
    plantillaId: string,
  ): Promise<readonly { readonly dispositivoId: string; readonly estado: EstadoEnEquipo }[]>;
  retiradasPendientes(copropiedadId: string, personaId: string): Promise<number>;
  capturasRecientes(
    copropiedadId: string,
    usuarioId: string,
    ahora: Date,
  ): Promise<readonly Date[]>;
}
export const LECTURA_DE_ROSTROS = Symbol.for('ncr.biometria.LecturaDeRostros');

export type ResultadoDeReemplazo =
  | { readonly ok: true; readonly reemplazada: string | null }
  | { readonly ok: false };

export interface AltaDeRostro {
  /** Nuevo, confirmado o el vigente que se reutiliza: se guarda con la plantilla. */
  readonly consentimiento: ConsentimientoBiometrico;
  readonly nueva: PlantillaBiometrica;
  /** La plantilla viva que se LEYÓ al empezar el registro, o `null`. */
  readonly anteriorLeida: string | null;
  readonly actorId: string;
  readonly ahora: Date;
}

export interface ReemplazoDeRostro {
  reemplazar(alta: AltaDeRostro): Promise<ResultadoDeReemplazo>;
}
export const REEMPLAZO_DE_ROSTRO = Symbol.for('ncr.biometria.ReemplazoDeRostro');
