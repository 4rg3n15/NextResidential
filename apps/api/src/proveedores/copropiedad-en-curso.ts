import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * 15-Q2 · C2 · la copropiedad de la petición en curso, para lo que habla con un
 * equipo SIN pasar por el puerto (la sonda de «Probar conexión», el corrector):
 * con puente, eso también tiene que ir por el Edge del conjunto, y lo que llega
 * a la sonda es un host y una clave, no un equipo.
 *
 * Sólo ENRUTA. No autoriza nada: el alcance de la copropiedad lo sigue
 * comprobando cada caso de uso (`Aislamiento.exigirAlcance`) antes de llegar a
 * la sonda; una ruta con la copropiedad de otro no pasa de ahí.
 */
const almacen = new AsyncLocalStorage<{ readonly copropiedadId: string }>();

export const copropiedadEnCurso = (): string | undefined => almacen.getStore()?.copropiedadId;

const RUTA_DE_COPROPIEDAD = /^\/copropiedades\/([0-9a-f-]{36})(\/|$|\?)/i;

@Injectable()
export class InterceptorDeCopropiedadEnCurso implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();
    const url = contexto.switchToHttp().getRequest<{ url?: string }>().url ?? '';
    const copropiedadId = RUTA_DE_COPROPIEDAD.exec(url)?.[1];
    if (copropiedadId === undefined) return siguiente.handle();
    return new Observable((suscriptor) =>
      almacen.run({ copropiedadId }, () => siguiente.handle().subscribe(suscriptor)),
    );
  }
}
