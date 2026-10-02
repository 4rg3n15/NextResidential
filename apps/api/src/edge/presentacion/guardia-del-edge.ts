import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CABECERA_EDGE } from '../aplicacion/credencial-del-edge';
import { AcreditarEdge } from '../aplicacion/acreditar-edge';
import type { GatewayRegistrado } from '../aplicacion/puertos';

/** Las cabeceras de la firma son las de la ingesta: un solo vocabulario. */
const CABECERA_FIRMA = 'x-ncr-firma';
const CABECERA_MARCA = 'x-ncr-marca-temporal';

export interface PeticionDelEdge extends Request {
  /** Lo deja `guardarCuerpoCrudo` (el `verify` de `express.json`). */
  cuerpoCrudo?: string;
  edgeAcreditado?: GatewayRegistrado;
}

/**
 * La guardia de las rutas del Edge (15-Q, Q1). Traduce la petición HTTP a
 * `AcreditarEdge` y deja el gateway acreditado en la petición; la decisión es
 * de la aplicación, no de aquí.
 *
 * Falla CERRADO como la de la ingesta (H-13-10): un `POST` sin cuerpo crudo —un
 * content-type que no es JSON— se rechaza en vez de firmarse sobre la cadena
 * vacía. Un `GET` no tiene cuerpo, y por eso firma la ruta.
 */
@Injectable()
export class GuardiaDelEdge implements CanActivate {
  constructor(@Inject(AcreditarEdge) private readonly acreditar: AcreditarEdge) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionDelEdge>();
    const cabecera = (nombre: string): string | undefined => {
      const valor = peticion.headers[nombre];
      return Array.isArray(valor) ? valor[0] : valor;
    };
    const sinCuerpo = peticion.method === 'GET' || peticion.method === 'HEAD';
    const cuerpo = sinCuerpo ? '' : peticion.cuerpoCrudo;
    if (cuerpo === undefined) throw new UnauthorizedException('Edge no acreditado');

    const resultado = await this.acreditar.acreditar({
      edgeId: cabecera(CABECERA_EDGE),
      marca: cabecera(CABECERA_MARCA),
      firma: cabecera(CABECERA_FIRMA),
      metodo: peticion.method,
      ruta: peticion.originalUrl,
      cuerpo,
      copropiedadSolicitada: String((peticion.params as Record<string, string>)['id'] ?? ''),
    });
    if (resultado.acreditado) {
      peticion.edgeAcreditado = resultado.gateway;
      return true;
    }
    // 404 a un Edge acreditado que pidió otra copropiedad: no se confirma que exista.
    if (resultado.estado === 404) throw new NotFoundException('Recurso no encontrado');
    throw new UnauthorizedException('Edge no acreditado');
  }
}
