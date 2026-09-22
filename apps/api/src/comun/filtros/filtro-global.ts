import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Bitacora } from '@ncr/domain-core';
import type { ReporteDeErrores } from '../../observabilidad';

/**
 * Manejo global de errores.
 *
 * Dos reglas, ambas de §2.7: al cliente se le devuelve lo mínimo —un error
 * interno nunca filtra el mensaje original, que suele llevar nombres de tabla o
 * fragmentos de consulta (§2.7.8, «fugas por mensajes de error»)—, y todo se
 * registra completo del lado del servidor con el identificador de correlación
 * para poder seguirlo.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL CUERPO DEL ERROR NO NOMBRA LA CLASE QUE LO LANZÓ · H-13-24
 *
 * Medido al ejercer el limitador bajo carga:
 *
 *   429 -> {"estado":429,…,"mensaje":"ThrottlerException: Too Many Requests"}
 *
 * `ThrottlerException` es el nombre interno de `@nestjs/throttler`. No es una
 * brecha, pero sí le dice a quien sondea qué biblioteca hay detrás y dónde
 * buscarle los CVE — información que §2.7.8 clasifica como fuga por mensaje de
 * error y que a un cliente legítimo no le sirve de nada.
 *
 * Se retira el prefijo `<Algo>Exception: ` de forma genérica, y no sólo para el
 * 429, porque cualquier `HttpException` de una dependencia futura llegará con
 * la misma forma. El texto útil —«Too Many Requests»— se conserva.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const sinNombreDeClase = (respuesta: string | object): string | object =>
  typeof respuesta === 'string'
    ? respuesta.replace(/^[A-Za-z]+(Exception|Error):\s*/, '')
    : respuesta;

@Catch()
export class FiltroGlobalDeExcepciones implements ExceptionFilter {
  /**
   * `reporte` es OPCIONAL y su ausencia significa «no hay agregador», no «no
   * reportes»: las suites construyen el filtro a solas y no tienen por qué
   * montar la observabilidad entera para comprobar que un 500 no filtra el
   * mensaje original. En producción lo inyecta `main.ts` (ETAPA 14).
   */
  constructor(
    private readonly bitacora: Bitacora,
    private readonly reporte?: ReporteDeErrores,
  ) {}

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const respuesta = ctx.getResponse<Response>();
    const peticion = ctx.getRequest<Request>();
    const correlacion =
      (peticion.headers['x-request-id'] as string | undefined) ?? 'sin-correlacion';

    const esHttp = excepcion instanceof HttpException;
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * EL 4xx QUE NO ES DE NEST SIGUE SIENDO UN 4xx · H-13-12
     *
     * `body-parser` y `express` no lanzan `HttpException`: lanzan `http-errors`,
     * que llevan su código en `status`/`statusCode`. Antes de la ETAPA 13 todos
     * caían al repliegue de 500. Medido, con el límite de payload de §2.7.8:
     *
     *   POST …/ordenes  cuerpo 150 kB -> 400
     *   POST …/ordenes  cuerpo 300 kB -> 500   ← es un 413
     *   {"nivel":"error","estado":500,"error":"request entity too large"}
     *
     * Dos consecuencias, ninguna cosmética: el cliente no sabía que se había
     * pasado de tamaño —recibía «Error interno»— y cada petición demasiado
     * grande generaba una entrada de nivel `error`, que es ruido justo encima
     * de la alerta que sí importa. Un cliente torpe podía así ahogar la señal.
     *
     * Sólo se adopta el código en el rango 4xx: un `status` de 5xx traído por
     * una biblioteca sigue siendo nuestro y no cambia nada.
     * ═══════════════════════════════════════════════════════════════════════
     */
    const codigoDeBiblioteca = ((): number | undefined => {
      if (esHttp || excepcion === null || typeof excepcion !== 'object') return undefined;
      const crudo =
        (excepcion as { status?: unknown; statusCode?: unknown }).status ??
        (excepcion as { statusCode?: unknown }).statusCode;
      return typeof crudo === 'number' && crudo >= 400 && crudo <= 499 ? crudo : undefined;
    })();

    const estado = esHttp
      ? excepcion.getStatus()
      : (codigoDeBiblioteca ?? HttpStatus.INTERNAL_SERVER_ERROR);

    // `correlacion` NO se repite en el contexto: desde la ETAPA 14 la bitácora
    // la pone en el nivel superior de TODA línea, y duplicarla aquí solo hacía
    // la entrada más larga sin decir nada nuevo.
    this.bitacora.registrar(estado >= 500 ? 'error' : 'aviso', 'peticion fallida', {
      metodo: peticion.method,
      ruta: peticion.url,
      estado,
      error: excepcion instanceof Error ? excepcion.message : String(excepcion),
    });

    /**
     * AL AGREGADOR, SOLO LOS 5xx (ETAPA 14). Un 400 o un 403 no son fallos del
     * sistema: son el sistema funcionando. Mandarlos a Sentry convertiría el
     * panel en un registro de accesos y enterraría el 500 que sí hay que mirar
     * —exactamente el ruido que H-13-12 describe para los logs, por otra vía—.
     *
     * `capturar` no devuelve nada y no puede lanzar: estamos atendiendo un
     * error, y un fallo del observador no puede dejar al cliente sin respuesta.
     */
    if (estado >= 500) {
      this.reporte?.capturar(excepcion, {
        correlacion,
        metodo: peticion.method,
        ruta: peticion.url,
        estado,
      });
    }

    respuesta.status(estado).json({
      estado,
      correlacion,
      // 4xx: el detalle es del cliente y le sirve. 5xx: es nuestro y no sale.
      // El 4xx de biblioteca lleva un mensaje genérico propio —«request entity
      // too large»— que no revela nada interno, pero se normaliza igualmente a
      // un texto nuestro para no depender de lo que escriba una dependencia.
      mensaje: esHttp
        ? sinNombreDeClase(excepcion.getResponse())
        : codigoDeBiblioteca === undefined
          ? 'Error interno'
          : 'Petición rechazada',
    });
  }
}
