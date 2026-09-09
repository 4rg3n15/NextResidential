import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { VerificadorDeJwt } from '../../autenticacion';
import { RechazoDeAutenticacion } from '../../autenticacion';
import type { ContextoTenant } from '../../autenticacion';
import { exigeSegundoFactor } from '../../autenticacion';
import { CLAVE_PUBLICO, CLAVE_SIN_SEGUNDO_FACTOR } from '../decoradores';
import { CLAVE_CONTEXTO } from '../decoradores/contexto.decorator';

/**
 * Guard global de autenticación. **Deniega por defecto**: solo `@Publico()`
 * exime. Es la diferencia entre una lista de rutas protegidas —que envejece mal
 * y olvida la última añadida— y una lista de exenciones, que es corta y se lee.
 */
@Injectable()
export class GuardaDeAutenticacion implements CanActivate {
  // Inyecciones EXPLÍCITAS por token, no por metadata de decoradores: el
  // transpilador de las pruebas no emite `design:paramtypes`, así que confiar
  // en la inferencia hace que el contenedor entregue `undefined` en la suite y
  // funcione en producción — el peor modo de fallo posible.
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(VerificadorDeJwt) private readonly verificador: VerificadorDeJwt,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const peticion = contexto.switchToHttp().getRequest<Request & Record<string, unknown>>();
    const cabecera = peticion.headers.authorization ?? '';
    const [esquema, token] = cabecera.split(' ');

    try {
      if (esquema?.toLowerCase() !== 'bearer' || !token) {
        throw new RechazoDeAutenticacion(cabecera ? 'FORMATO_INVALIDO' : 'SIN_TOKEN');
      }
      const claims = await this.verificador.verificar(token);

      // RN-20 / CA-25: un rol administrativo con `aal1` está autenticado pero
      // NO habilitado. Se rechaza aquí y no en el guard de roles para que la
      // regla no dependa de que cada ruta se acuerde de declararla.
      const mfaVerificado = claims.aal === 'aal2';
      // La exención es por RUTA y se lee del decorador, nunca del token: si
      // dependiera de algo que trae el cliente, el cliente podría concedérsela.
      const admiteAal1 =
        this.reflector.getAllAndOverride<boolean>(CLAVE_SIN_SEGUNDO_FACTOR, [
          contexto.getHandler(),
          contexto.getClass(),
        ]) === true;
      if (exigeSegundoFactor(claims.rol) && !mfaVerificado && !admiteAal1) {
        throw new RechazoDeAutenticacion('SEGUNDO_FACTOR_REQUERIDO');
      }

      const ctx: ContextoTenant = {
        usuarioId: claims.usuario_id,
        ...(claims.persona_id ? { personaId: claims.persona_id } : {}),
        rol: claims.rol,
        copropiedadId: claims.copropiedad_id ?? null,
        copropiedadesAtendidas: claims.copropiedades ?? [],
        mfaVerificado,
      };
      peticion[CLAVE_CONTEXTO] = ctx;
      return true;
    } catch (e) {
      const motivo = e instanceof RechazoDeAutenticacion ? e.motivo : 'FIRMA_INVALIDA';
      this.bitacora.registrar('aviso', 'autenticacion rechazada', {
        motivo,
        ruta: peticion.url,
        metodo: peticion.method,
      });
      // Al cliente, un único mensaje. El motivo queda en la bitácora: decirle
      // a quien prueba tokens si falló la firma o la expiración le ahorra
      // trabajo de sondeo.
      throw new UnauthorizedException('No autenticado');
    }
  }
}
