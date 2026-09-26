import type { VerificadorDeJwt } from '../../autenticacion';
import type { IdentidadDelToken, LectorDeToken } from '../aplicacion/puertos';

/**
 * Lee los claims de un token RECIÉN emitido, verificándolo con el mismo
 * verificador que la guarda (firma, emisor, audiencia, forma). Que el token
 * venga del proveedor por TLS no es motivo para leerlo sin verificar: el
 * gancho de claims podría no haberse ejecutado, y entonces no hay rol.
 */
export class LectorDeTokenVerificado implements LectorDeToken {
  constructor(private readonly verificador: VerificadorDeJwt) {}

  async leer(accessToken: string): Promise<IdentidadDelToken | null> {
    try {
      const c = await this.verificador.verificar(accessToken);
      return {
        usuarioId: c.usuario_id,
        rol: c.rol,
        copropiedadId: c.copropiedad_id ?? null,
        sesionId: c.session_id ?? null,
        debeCambiarContrasena: c.debe_cambiar_contrasena === true,
      };
    } catch {
      return null;
    }
  }
}
