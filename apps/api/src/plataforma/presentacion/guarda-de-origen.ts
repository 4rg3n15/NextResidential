import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ContextoTenant } from '../../autenticacion';
import { CLAVE_PUBLICO } from '../../comun/decoradores';
import { CLAVE_CONTEXTO } from '../../comun/decoradores/contexto.decorator';
import { ControlDeIpDePorteros } from '../aplicacion/control-de-ip';
import { PresenciaDeSuperadministrador } from '../aplicacion/presencia-y-intentos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H4 (15-L) · DE DÓNDE VIENE CADA PETICIÓN, PARA DOS ROLES
 *
 *  · PORTERO: su IP tiene que ser la de portería, o una de guardia remota (o,
 *    con la lista vacía, la de una sesión activa de superadministrador). Las
 *    rutas marcadas `@SoloGuardiaRemota()` no admiten la IP de portería. Se
 *    evalúa en CADA petición: quitar una IP de la lista corta las sesiones
 *    abiertas desde ella. 403 con el texto exacto «No autorizado para guardia
 *    remota», y la fila en `auditoria_seguridad`.
 *  · SUPERADMINISTRADOR: se anota desde dónde está (H4 b). No se le restringe
 *    nada: entra desde cualquier IP (H4 c). Residente y administrador, ni lo
 *    ven (H4 d).
 *
 * La IP es `req.ip`, que ya viene resuelta por el `trust proxy` acotado de
 * `aplicarSeguridad` (H6): la del navegador si llega por el proxy de la
 * consola, la del socket si no.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const CLAVE_SOLO_GUARDIA_REMOTA = 'ncr:solo_guardia_remota';

/** Lo que sólo tiene sentido desde la guardia remota: la IP de portería no basta. */
export const SoloGuardiaRemota = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_SOLO_GUARDIA_REMOTA, true);

@Injectable()
export class GuardaDeOrigen implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ControlDeIpDePorteros) private readonly control: ControlDeIpDePorteros,
    @Inject(PresenciaDeSuperadministrador)
    private readonly presencia: PresenciaDeSuperadministrador,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos)) return true;
    const peticion = contexto.switchToHttp().getRequest<Request & Record<string, unknown>>();
    const ctx = peticion[CLAVE_CONTEXTO] as ContextoTenant | undefined;
    const ip = typeof peticion.ip === 'string' && peticion.ip !== '' ? peticion.ip : null;

    if (ctx?.rol === 'superadministrador') {
      if (ctx.sesionId !== undefined && ip !== null) {
        await this.presencia.anotar(ctx.sesionId, ctx.usuarioId, ip);
      }
      return true;
    }
    if (ctx?.rol !== 'portero' || ctx.copropiedadId === null) return true;

    const agente = peticion.headers['user-agent'];
    const v = await this.control.evaluar({
      copropiedadId: ctx.copropiedadId,
      usuarioId: ctx.usuarioId,
      ip,
      agente: typeof agente === 'string' ? agente : null,
      soloRemota:
        this.reflector.getAllAndOverride<boolean>(CLAVE_SOLO_GUARDIA_REMOTA, objetivos) === true,
      recurso: `${peticion.method} ${peticion.route?.path ?? peticion.path}`.slice(0, 200),
    });
    if (!v.permitido) throw new ForbiddenException(v.mensaje);
    return true;
  }
}
