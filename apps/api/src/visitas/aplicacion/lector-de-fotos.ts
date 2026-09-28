import type { RepositorioAutorizaciones } from '../../autorizaciones';
import type { LectorDeFotosDeVisita } from './puertos';

/**
 * F6 · la foto de una autorización anterior, en bytes, para copiarla a la
 * nueva. La referencia la da el repositorio de autorizaciones; los bytes, el
 * almacén de evidencia. La foto no viaja al cliente por aquí.
 */
export class AlmacenDeFotos {
  constructor(
    private readonly autorizaciones: RepositorioAutorizaciones,
    private readonly lector: LectorDeFotosDeVisita,
  ) {}

  async deLaAutorizacion(
    copropiedadId: string,
    autorizacionId: string,
  ): Promise<{ readonly contenidoBase64: string; readonly tipoMime: string } | null> {
    const referencia = await this.autorizaciones.fotografiaDe(copropiedadId, autorizacionId);
    if (referencia === null) return null;
    const bytes = await this.lector.leer(referencia.clave);
    if (bytes === null || bytes.length === 0) return null;
    return {
      contenidoBase64: Buffer.from(bytes).toString('base64'),
      tipoMime: referencia.tipoMime,
    };
  }
}
