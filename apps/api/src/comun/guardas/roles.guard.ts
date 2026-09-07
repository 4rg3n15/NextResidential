import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ContextoTenant, Rol } from '../../autenticacion/dominio/claims';
import { CLAVE_PUBLICO, CLAVE_ROLES, CLAVE_SERVICIO } from '../decoradores';
import { CLAVE_CONTEXTO } from '../decoradores/contexto.decorator';

/**
 * RBAC declarativo. Una ruta SIN `@Roles()` no es una ruta abierta a todos los
 * roles: es una ruta sin política declarada, y se deniega. El olvido cuesta un
 * 403 en desarrollo, no una fuga en producción.
 */
@Injectable()
export class GuardaDeRoles implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    // `@Publico()` exime a los dos guards. Que este también lo compruebe evita
    // que /health quede detrás de una política de roles que no tiene sentido
    // para una sonda de infraestructura.
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const permitidos = this.reflector.getAllAndOverride<Rol[]>(CLAVE_ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    const peticion = contexto.switchToHttp().getRequest<Request & Record<string, unknown>>();
    const ctx = peticion[CLAVE_CONTEXTO] as ContextoTenant | undefined;
    if (!ctx) return false;

    if (!permitidos || permitidos.length === 0) {
      throw new ForbiddenException('Ruta sin política de roles declarada');
    }
    if (!permitidos.includes(ctx.rol)) throw new ForbiddenException('Rol no autorizado');

    // La identidad de servicio solo entra donde se la admite explícitamente.
    if (ctx.rol === 'servicio') {
      const permite = this.reflector.getAllAndOverride<boolean>(CLAVE_SERVICIO, [
        contexto.getHandler(),
        contexto.getClass(),
      ]);
      if (!permite) throw new ForbiddenException('Identidad de servicio no admitida en esta ruta');
    }
    return true;
  }
}
