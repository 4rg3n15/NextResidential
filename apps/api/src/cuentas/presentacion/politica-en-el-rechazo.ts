import { BadRequestException, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { catchError } from 'rxjs';
import { POLITICA_DE_DATOS } from '../aplicacion/politica-de-datos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL TEXTO DE LA POLÍTICA VIAJA EN EL 400 DE «CREAR CUENTA» · 15-W ([CONTRADICCIÓN] C-60)
 *
 * El encargo pide dos cosas que tiran en sentidos contrarios: que la casilla de
 * la app muestre «el texto que entrega el servidor», y que no haya ninguna ruta
 * pública nueva salvo `POST /auth/registro`. Una `GET` con el texto sería una
 * segunda exención. Resolución: TODO 400 de esa ruta —el de forma del
 * `ValidationPipe` incluido— lleva `politica: { version, texto }`. La app la
 * pide enviando el formulario vacío al abrir la pantalla, y si la versión que
 * mostró ya no es la vigente, el mismo 400 trae la nueva.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class PoliticaEnElRechazo implements NestInterceptor {
  intercept(_contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    return siguiente.handle().pipe(
      catchError((error: unknown) => {
        if (!(error instanceof BadRequestException)) throw error;
        const cuerpo = error.getResponse();
        throw new BadRequestException({
          ...(typeof cuerpo === 'object' ? cuerpo : { message: cuerpo }),
          politica: POLITICA_DE_DATOS,
        });
      }),
    );
  }
}
