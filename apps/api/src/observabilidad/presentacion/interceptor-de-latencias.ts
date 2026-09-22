import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
/**
 * `Reflector` se importa como VALOR, no como tipo, y la regla se apaga aquí a
 * propósito. Es la misma trampa de D-24: `import type` borra la clase al
 * compilar, `design:paramtypes` queda en `Object` y Nest no puede resolver la
 * dependencia. Allí el síntoma fue un `ValidationPipe` inerte; aquí sería un
 * interceptor que no arranca. La regla no distingue un tipo de un token de
 * inyección, así que la excepción va donde se ve.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { METRICAS } from '../aplicacion/puertos';
import type { Metricas } from '../aplicacion/puertos';
import { esClaveKpi } from '../aplicacion/kpis';
import { CLAVE_KPI } from './mide-kpi.decorator';

/**
 * Pone el cronómetro donde lo declara `@MideKpi`, y en ningún otro sitio.
 *
 * SE MIDE TAMBIÉN LO QUE FALLA. `tap` con sus dos ramas: una petición que
 * termina en 500 tras nueve segundos es exactamente la muestra que un tablero
 * no puede perder, y medir solo el camino feliz es cómo un p99 sale bonito
 * mientras el servicio se cae. El resultado no se guarda —esto mide latencia,
 * no tasa de error, que ya la lleva el log y Sentry—, pero el tiempo sí.
 *
 * EL RELOJ ES EL INYECTADO (§2.4), no `Date.now()`. Aquí no es purismo: es lo
 * que permite que una prueba fije dos instantes y compruebe que la muestra
 * anotada es la diferencia entre ellos, en vez de comprobar que «es un número».
 */
@Injectable()
export class InterceptorDeLatencias implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(METRICAS) private readonly metricas: Metricas,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const clave = this.reflector.getAllAndOverride<unknown>(CLAVE_KPI, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!esClaveKpi(clave)) return siguiente.handle();

    const inicio = this.reloj.ahora().getTime();
    const anotar = (): void => {
      this.metricas.observar(clave, this.reloj.ahora().getTime() - inicio);
    };
    return siguiente.handle().pipe(tap({ next: anotar, error: anotar }));
  }
}
