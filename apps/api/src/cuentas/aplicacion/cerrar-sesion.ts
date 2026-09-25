import type { ContextoTenant } from '../../autenticacion';
import type { GanchosDeSesion, ProveedorDeIdentidad } from './puertos';

/**
 * CIERRE DE SESIÓN · el del propio llamante.
 *
 * Primero el gancho del rol —portería cierra su registro y deja constancia—,
 * después el proveedor. En ese orden: si el proveedor fallara, la sesión del
 * portero ya no serviría en la API, que es la que decide.
 */
export class CerrarSesion {
  constructor(
    private readonly proveedor: ProveedorDeIdentidad,
    private readonly ganchos: GanchosDeSesion,
  ) {}

  async ejecutar(ctx: ContextoTenant, accessToken: string | null): Promise<void> {
    const gancho = this.ganchos.de(ctx.rol);
    if (gancho !== undefined && ctx.copropiedadId !== null && ctx.sesionId !== undefined) {
      await gancho.alCerrar({
        usuarioId: ctx.usuarioId,
        copropiedadId: ctx.copropiedadId,
        sesionId: ctx.sesionId,
      });
    }
    if (accessToken !== null) await this.proveedor.cerrarSesion(accessToken);
  }
}
