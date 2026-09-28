import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';

/**
 * §2.7.5 · todo 429 lleva `Retry-After`. El guardián de `@nestjs/throttler`
 * sólo lo pone con ese nombre para el limitador `default`: los que tienen
 * nombre —acceso por cuenta y por origen, dispositivo (D-28)— emiten
 * `Retry-After-<nombre>`, que ningún cliente estándar lee. Visto en la 15-L al
 * probar el bloqueo por (IP, número) del portero.
 */
@Injectable()
export class GuardaDeLimites extends ThrottlerGuard {
  protected override async throwThrottlingException(
    contexto: ExecutionContext,
    detalle: ThrottlerLimitDetail,
  ): Promise<void> {
    const respuesta = contexto.switchToHttp().getResponse<Response>();
    if (!respuesta.headersSent)
      respuesta.setHeader('Retry-After', String(detalle.timeToBlockExpire));
    await super.throwThrottlingException(contexto, detalle);
  }
}
