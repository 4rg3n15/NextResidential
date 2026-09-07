import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { GENERADOR_DE_ID } from '@ncr/domain-core';
import type { GeneradorDeId } from '@ncr/domain-core';
import { Inject } from '@nestjs/common';

/**
 * Correlación de petición. Se fija aquí y no en el logger para que el mismo
 * identificador viaje en la respuesta: sin eso, un usuario que reporta un fallo
 * no tiene forma de señalar la línea de log correspondiente.
 */
@Injectable()
export class InterceptorDeCorrelacion implements NestInterceptor {
  constructor(@Inject(GENERADOR_DE_ID) private readonly ids: GeneradorDeId) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const http = contexto.switchToHttp();
    const peticion = http.getRequest<Request>();
    const respuesta = http.getResponse<Response>();
    const correlacion =
      (peticion.headers['x-request-id'] as string | undefined) ?? this.ids.nuevo();
    peticion.headers['x-request-id'] = correlacion;
    respuesta.setHeader('x-request-id', correlacion);
    return siguiente.handle();
  }
}
