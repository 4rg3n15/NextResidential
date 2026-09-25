import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/** 423 Locked (RFC 4918): Nest no lo enumera en `HttpStatus`. */
export const ESTADO_BLOQUEADA = 423;
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ContextoTenant } from '../../autenticacion';
import {
  CLAVE_DURANTE_EL_PATRULLAJE,
  CLAVE_FUERA_DE_TURNO,
  CLAVE_PUBLICO,
} from '../../comun/decoradores';
import { CLAVE_CONTEXTO } from '../../comun/decoradores/contexto.decorator';
import { ControlDeSesiones } from '../aplicacion/control-de-sesiones';

export const MENSAJE_PATRULLAJE = 'Sesión en patrullaje: ingrese el código para continuar';
export const MENSAJE_FUERA_DE_TURNO = 'Fuera de su turno: la sesión se cerró al terminar la franja';
export const MENSAJE_SIN_SESION =
  'La sesión de portería no está registrada o ya se cerró: ingrese de nuevo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TURNO Y PATRULLAJE DEL PORTERO · en CADA petición (ADR-024, C-33)
 *
 * El token del portero no caduca con su turno —dura lo que diga el
 * proveedor— así que el turno no puede vivir en el token. Vive aquí: cada
 * petición de un portero consulta su sesión registrada y el turno al que está
 * atada, con el reloj inyectado. Fuera de la franja la sesión se cierra en ese
 * mismo momento y la petición recibe 403; en patrullaje recibe 423 salvo en
 * las tres rutas que lo resuelven (estado, desbloqueo y cierre).
 *
 * Va la ÚLTIMA de las guardas globales: una ruta que el rol no alcanza
 * responde por su rol, y una con el cambio de contraseña pendiente, por eso.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class GuardaDeTurnoDePorteria implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ControlDeSesiones) private readonly control: ControlDeSesiones,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos)) return true;
    const peticion = contexto.switchToHttp().getRequest<Request & Record<string, unknown>>();
    const ctx = peticion[CLAVE_CONTEXTO] as ContextoTenant | undefined;
    if (ctx?.rol !== 'portero') return true;

    const fueraDeTurnoAdmitido =
      this.reflector.getAllAndOverride<boolean>(CLAVE_FUERA_DE_TURNO, objetivos) === true;
    const patrullajeAdmitido =
      this.reflector.getAllAndOverride<boolean>(CLAVE_DURANTE_EL_PATRULLAJE, objetivos) === true;

    const estado = await this.control.validar({
      copropiedadId: ctx.copropiedadId,
      usuarioId: ctx.usuarioId,
      sesionId: ctx.sesionId,
    });
    switch (estado.tipo) {
      case 'activa':
        return true;
      case 'patrullaje':
        if (patrullajeAdmitido) return true;
        throw new HttpException(MENSAJE_PATRULLAJE, ESTADO_BLOQUEADA);
      case 'fuera_de_turno':
        if (fueraDeTurnoAdmitido) return true;
        throw new ForbiddenException(MENSAJE_FUERA_DE_TURNO);
      case 'cerrada':
      case 'sin_registro':
        if (fueraDeTurnoAdmitido) return true;
        throw new UnauthorizedException(MENSAJE_SIN_SESION);
    }
  }
}
