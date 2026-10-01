import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { alcanzaCopropiedad } from '../../autenticacion';
import { ROLES_QUE_OPERAN_SALIDAS } from './puntos-de-acceso';
import type { PuntoDeAcceso, RepositorioDePuntos } from './puntos-de-acceso';

/**
 * 15-P · P3 · LOS PUNTOS DE ACCESO, PARA QUIEN ABRE.
 *
 * La guardia y la portería ven los puntos PERSISTIDOS del equipo en atención
 * —nunca el árbol en vivo: abrir no espera a que el equipo conteste una
 * lectura— y la orden manual resuelve aquí la puerta del punto elegido. Un
 * punto de otra copropiedad, de otro equipo o dado de baja no existe: la
 * orden no sale (denegar por defecto).
 */
export class PuntosDeOperacion {
  constructor(private readonly puntos: Pick<RepositorioDePuntos, 'listar'>) {}

  async listar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<Resultado<readonly PuntoDeAcceso[], ErrorDominio>> {
    if (!this.alcanza(ctx, copropiedadId)) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'Tu rol no ve los puntos de acceso', 'RN-08'),
      );
    }
    return exito(await this.puntos.listar(ctx, copropiedadId, dispositivoId));
  }

  /** El punto ACTIVO de ese equipo y esa copropiedad, o `null`. */
  async resolver(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    puntoId: string,
  ): Promise<PuntoDeAcceso | null> {
    if (!this.alcanza(ctx, copropiedadId)) return null;
    const activos = await this.puntos.listar(ctx, copropiedadId, dispositivoId);
    return activos.find((p) => p.id === puntoId) ?? null;
  }

  private alcanza(ctx: ContextoTenant, copropiedadId: string): boolean {
    return ROLES_QUE_OPERAN_SALIDAS.includes(ctx.rol) && alcanzaCopropiedad(ctx, copropiedadId);
  }
}
