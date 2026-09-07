import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Bitacora } from '@ncr/domain-core';

/**
 * Manejo global de errores.
 *
 * Dos reglas, ambas de §2.7: al cliente se le devuelve lo mínimo —un error
 * interno nunca filtra el mensaje original, que suele llevar nombres de tabla o
 * fragmentos de consulta (§2.7.8, «fugas por mensajes de error»)—, y todo se
 * registra completo del lado del servidor con el identificador de correlación
 * para poder seguirlo.
 */
@Catch()
export class FiltroGlobalDeExcepciones implements ExceptionFilter {
  constructor(private readonly bitacora: Bitacora) {}

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const respuesta = ctx.getResponse<Response>();
    const peticion = ctx.getRequest<Request>();
    const correlacion =
      (peticion.headers['x-request-id'] as string | undefined) ?? 'sin-correlacion';

    const esHttp = excepcion instanceof HttpException;
    const estado = esHttp ? excepcion.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    this.bitacora.registrar(estado >= 500 ? 'error' : 'aviso', 'peticion fallida', {
      correlacion,
      metodo: peticion.method,
      ruta: peticion.url,
      estado,
      error: excepcion instanceof Error ? excepcion.message : String(excepcion),
    });

    respuesta.status(estado).json({
      estado,
      correlacion,
      // 4xx: el detalle es del cliente y le sirve. 5xx: es nuestro y no sale.
      mensaje: esHttp ? excepcion.getResponse() : 'Error interno',
    });
  }
}
