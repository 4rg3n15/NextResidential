import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import type { ContextoTenant } from '../autenticacion';
import { alcanzaCopropiedad } from '../autenticacion';

export interface RegistroDeAuditoria {
  registrarAccesoCruzado(entrada: {
    usuarioId: string;
    rol: string;
    copropiedadSolicitada: string;
    recurso: string;
  }): Promise<void>;

  /**
   * Rastro del cambio de credencial (migración 0023, §2.7.8).
   *
   * Método propio y no uno genérico `registrar(tipo, ...)`: cada evento de
   * seguridad tiene su forma, y un método que acepta cualquier tipo acaba
   * recibiendo cadenas libres que nadie puede filtrar después.
   */
  registrarRestablecimiento(entrada: {
    usuarioId: string;
    rol: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void>;
}

export const REGISTRO_AUDITORIA = Symbol.for('ncr.puerto.RegistroDeAuditoria');

/**
 * Barrera de aislamiento en la CAPA DE APLICACIÓN.
 *
 * La RLS ya aísla por fila, pero la llave secreta la omite (`BYPASSRLS`), y la
 * usan el Edge, los workers y la ingesta. Sin esta comprobación, esas rutas
 * quedarían sin ninguna barrera: es el riesgo número uno del proyecto (§2.7.6).
 * Por eso el chequeo es explícito y no una consecuencia de la base.
 *
 * Devuelve 404 y no 403 cuando el recurso pertenece a otra copropiedad: un 403
 * confirma que el identificador EXISTE, y esa confirmación ya es una fuga —
 * permite enumerar viviendas o autorizaciones ajenas contando respuestas.
 */
@Injectable()
export class Aislamiento {
  constructor(
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(REGISTRO_AUDITORIA) private readonly auditoria: RegistroDeAuditoria,
  ) {}

  async exigirAlcance(ctx: ContextoTenant, copropiedadId: string, recurso: string): Promise<void> {
    if (alcanzaCopropiedad(ctx, copropiedadId)) return;

    this.bitacora.registrar('aviso', 'acceso cruzado bloqueado', {
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      recurso,
    });
    await this.auditoria.registrarAccesoCruzado({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      recurso,
    });
    throw new NotFoundException('Recurso no encontrado');
  }

  /** Para rutas de servicio: la copropiedad llega en el cuerpo, no en el token. */
  async exigirAlcanceDeServicio(
    ctx: ContextoTenant,
    copropiedadId: string,
    recurso: string,
  ): Promise<void> {
    if (ctx.rol !== 'servicio') return this.exigirAlcance(ctx, copropiedadId, recurso);
    if (ctx.copropiedadId === copropiedadId) return;
    await this.auditoria.registrarAccesoCruzado({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      recurso,
    });
    throw new ForbiddenException('Copropiedad fuera del alcance de la identidad de servicio');
  }
}
