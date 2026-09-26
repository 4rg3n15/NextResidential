import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ContextoTenant } from '../../autenticacion';
import { CLAVE_CON_CAMBIO_PENDIENTE, CLAVE_PUBLICO } from '../decoradores';
import { CLAVE_CONTEXTO } from '../decoradores/contexto.decorator';

/** Texto fijo: la consola lo reconoce para llevar a la pantalla de cambio. */
export const MENSAJE_CAMBIO_PENDIENTE = 'Debe cambiar su contraseña antes de continuar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PRIMER INGRESO · IMPUESTO EN EL SERVIDOR (ADR-023)
 *
 * Una cuenta con `debe_cambiar_contrasena` en el token —la emite el gancho
 * desde `usuarios`— recibe 403 en TODA ruta salvo las marcadas con
 * `@PermiteCambioPendiente()`: el cambio de contraseña y el cierre de sesión.
 * Esconderlo en la consola no protegería nada: quien tenga el token podría
 * llamar a la API directamente.
 *
 * Va DESPUÉS del guard de roles a propósito: una ruta que el rol no alcanza
 * responde por su rol, y una ruta que sí alcanza responde por el cambio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class GuardaDeCambioDeContrasena implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos)) return true;
    const peticion = contexto.switchToHttp().getRequest<Request & Record<string, unknown>>();
    const ctx = peticion[CLAVE_CONTEXTO] as ContextoTenant | undefined;
    if (ctx?.debeCambiarContrasena !== true) return true;
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_CON_CAMBIO_PENDIENTE, objetivos)) {
      return true;
    }
    throw new ForbiddenException(MENSAJE_CAMBIO_PENDIENTE);
  }
}
