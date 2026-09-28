import type { Vigencia } from '@ncr/domain-core';
import type { RepositorioAutorizaciones } from '../../autorizaciones';
import type { VigenciaDeAutorizaciones } from '../aplicacion/puertos';

/**
 * A2 (15-L) · la vigencia sale del agregado `Autorizacion`, por el puerto que
 * el módulo de autorizaciones publica en su barril: biometría no lee su tabla.
 * Revocada es revocada aunque la vigencia siga corriendo (RN-01), así que se
 * devuelve `null` y la plantilla no se sincroniza.
 */
export class VigenciaDesdeAutorizaciones implements VigenciaDeAutorizaciones {
  constructor(private readonly autorizaciones: Pick<RepositorioAutorizaciones, 'porId'>) {}

  async deLaAutorizacion(copropiedadId: string, autorizacionId: string): Promise<Vigencia | null> {
    const autorizacion = await this.autorizaciones.porId(copropiedadId, autorizacionId);
    if (autorizacion === null || autorizacion.estado === 'revocada') return null;
    return autorizacion.vigencia;
  }
}
