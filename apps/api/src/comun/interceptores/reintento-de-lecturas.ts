import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { retry, tap, throwError, timer } from 'rxjs';
import type { Bitacora } from '@ncr/domain-core';
import { esErrorDeConexion } from '../../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-O · UNA LECTURA CORTADA SE REINTENTA UNA VEZ
 *
 * Cuando PostgreSQL (o el pooler) corta la conexión a mitad de una consulta, el
 * pool descarta ese cliente y la siguiente consulta abre otro. Para una
 * LECTURA —`GET`/`HEAD`, sin efectos— volver a pedirla es seguro y le ahorra
 * al portero un 503 por un corte que ya pasó. Una escritura no se repite
 * aquí: sale con 503 y quien la hizo decide (el Edge reintenta con su clave de
 * idempotencia; la consola lo dice).
 *
 * UNA sola vez, y sólo si la respuesta no empezó (un flujo SSE que ya emitió
 * no se reabre por debajo): si la base sigue caída, el segundo fallo es el que
 * se responde.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ESPERA_ANTES_DEL_REINTENTO_MS = 100;

export class InterceptorDeReintentoDeLecturas implements NestInterceptor {
  constructor(private readonly bitacora: Bitacora) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();
    const peticion = contexto.switchToHttp().getRequest<Request>();
    if (peticion.method !== 'GET' && peticion.method !== 'HEAD') return siguiente.handle();
    let emitio = false;
    return siguiente.handle().pipe(
      tap(() => {
        emitio = true;
      }),
      retry({
        count: 1,
        delay: (error: unknown) => {
          if (emitio || !esErrorDeConexion(error)) return throwError(() => error);
          this.bitacora.registrar('aviso', 'lectura reintentada tras un corte de la base', {
            metodo: peticion.method,
            ruta: peticion.path,
          });
          return timer(ESPERA_ANTES_DEL_REINTENTO_MS);
        },
      }),
    );
  }
}
