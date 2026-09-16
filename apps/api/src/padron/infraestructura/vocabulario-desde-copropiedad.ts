import { Injectable } from '@nestjs/common';
import type { ContextoTenant } from '../../autenticacion';
import type { RepositorioCopropiedades } from '../../multiempresa/repositorio-copropiedades';
import type { LectorDeVocabulario, VocabularioDeCopropiedad } from '../aplicacion/vocabulario';

/**
 * Cumple el puerto del padrón **con el repositorio de `multiempresa`**, no con
 * una consulta a su tabla.
 *
 * Esa es toda la razón de que este fichero exista y tenga cinco líneas útiles:
 * §2.2 prohíbe que un módulo consulte las tablas de otro, y el padrón necesita
 * tres datos que pertenecen a `Copropiedad`. Con el adaptador, la frontera vive
 * en el código; sin él, viviría en el documento de arquitectura.
 */
@Injectable()
export class VocabularioDesdeCopropiedad implements LectorDeVocabulario {
  constructor(private readonly copropiedades: RepositorioCopropiedades) {}

  async leer(ctx: ContextoTenant, copropiedadId: string): Promise<VocabularioDeCopropiedad | null> {
    const configuracion = await this.copropiedades.leerConfiguracion(ctx, copropiedadId);
    if (configuracion === null) return null;
    return {
      tipo: configuracion.tipo,
      etiquetaVivienda: configuracion.etiquetaVivienda,
      etiquetaAgrupacion: configuracion.etiquetaAgrupacion,
    };
  }
}
