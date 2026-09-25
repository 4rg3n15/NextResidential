import { puedeReconocer } from '@ncr/domain-core';
import type { RepositorioConsentimientos, RepositorioPlantillas } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUIÉN ES EL DUEÑO DE UNA PLANTILLA, Y SI SE LE PUEDE RECONOCER AHORA · A2
 *
 * La terminal no sabe quién es nadie: reconoce un `FPID`, que es el
 * identificador con el que se dio de alta la plantilla (nunca el nombre, nunca
 * un documento: el aparato no es fuente de verdad). Traducirlo a la persona es
 * de este módulo, y decidir si esa persona puede ser reconocida en este
 * instante también: es `puedeReconocer` del dominio —consentimiento vigente Y
 * plantilla activa—, aplicado a las plantillas del titular.
 *
 * Dos preguntas, dos consumidores, una sola implementación:
 *  · el receptor de equipos pregunta «¿de quién es esta plantilla?» para
 *    registrar el acceso a nombre de una PERSONA (`eventos.persona_id`);
 *  · el cargador de contexto pregunta «¿tiene consentimiento vigente?» para
 *    que el motor emita SIN_CONSENTIMIENTO sólo cuando es verdad (S-34).
 */
export class IdentidadBiometricaDesdeRepositorios {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly consentimientos: RepositorioConsentimientos,
  ) {}

  /** La persona dueña de la plantilla, o `null` si Next Control no la gestiona. */
  async titularDePlantilla(copropiedadId: string, plantillaId: string): Promise<string | null> {
    const plantilla = await this.plantillas.porId(copropiedadId, plantillaId);
    return plantilla?.titularId ?? null;
  }

  /**
   * `true` sólo si ALGUNA plantilla del titular está activa y su consentimiento
   * sigue vigente ahora. Entre sincronizar y reconocer pueden pasar días, y en
   * esos días el titular pudo revocar: por eso se vuelve a preguntar aquí.
   */
  async consentimientoVigente(
    copropiedadId: string,
    personaId: string,
    ahora: Date,
  ): Promise<boolean> {
    const plantillas = await this.plantillas.deTitular(copropiedadId, personaId);
    for (const plantilla of plantillas) {
      const consentimiento = await this.consentimientos.porId(
        copropiedadId,
        plantilla.consentimientoId,
      );
      if (puedeReconocer(plantilla, consentimiento, ahora).permitido) return true;
    }
    return false;
  }
}
