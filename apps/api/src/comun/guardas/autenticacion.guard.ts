import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { VerificadorDeJwt } from '../../autenticacion';
import { RechazoDeAutenticacion } from '../../autenticacion';
import type { ContextoTenant } from '../../autenticacion';
import { exigeSegundoFactor } from '../../autenticacion';
import { CLAVE_PUBLICO, CLAVE_SIN_SEGUNDO_FACTOR } from '../decoradores';
import { POLITICA_MFA } from './politica-mfa';
import type { PoliticaMfa } from './politica-mfa';
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
    @Inject(POLITICA_MFA) private readonly politicaMfa: PoliticaMfa,
  ) {}

  /**
   * Se avisa UNA vez por proceso, no en cada petición: con el interruptor
   * puesto, un aviso por llamada ahogaría la bitácora justo cuando hace falta
   * leerla. Una vez basta para que quede constancia de con qué política
   * arrancó este proceso.
   */
  private avisoDeMfaDesactivado = false;

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
        /**
         * DESVIACIÓN DECLARADA · `MFA_OBLIGATORIO=false`. El rol administrativo
         * pasa con `aal1`. Todo lo demás sigue en pie: firma verificada contra
         * el JWKS, rol, copropiedad y aislamiento. `mfaVerificado` conserva su
         * valor REAL —`false`—, así que ninguna ruta que mire ese campo cree
         * que hubo segundo factor: la desviación no se propaga disfrazada.
         */
        if (this.politicaMfa.obligatorio) {
          throw new RechazoDeAutenticacion('SEGUNDO_FACTOR_REQUERIDO');
        }
        if (!this.avisoDeMfaDesactivado) {
          this.avisoDeMfaDesactivado = true;
          this.bitacora.registrar(
            'aviso',
            'MFA DESACTIVADO: se acepta aal1 en rol administrativo',
            {
              rol: claims.rol,
              variable: 'MFA_OBLIGATORIO=false',
              contrato: 'RN-20 / CA-25 / §2.7.8 — desviación temporal',
            },
          );
        }
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
      /**
       * **Un error que no es un rechazo NO se disfraza de rechazo.**
       *
       * Aquí decía `FIRMA_INVALIDA` para todo lo que no fuera un
       * `RechazoDeAutenticacion`, y esa línea es la que costó tres rondas de
       * trabajo: con el JWKS en 404 la bitácora repetía «firma inválida» en
       * cada intento, y la firma no tenía nada de malo — no había ninguna
       * clave con la que comprobarla. El registro debe decir qué pasó, no una
       * hipótesis sobre qué pasó.
       */
      const motivo = e instanceof RechazoDeAutenticacion ? e.motivo : 'ERROR_INESPERADO';
      const esFalloDelServidor = motivo === 'JWKS_NO_DISPONIBLE' || motivo === 'ERROR_INESPERADO';

      this.bitacora.registrar(esFalloDelServidor ? 'error' : 'aviso', 'autenticacion rechazada', {
        motivo,
        ruta: peticion.url,
        metodo: peticion.method,
        // Solo para lo inesperado, y solo la clase y el texto del error: nunca
        // el token, nunca la cabecera. Sin esto, «inesperado» no se diagnostica.
        ...(motivo === 'ERROR_INESPERADO' && e instanceof Error
          ? { error: `${e.name}: ${e.message}` }
          : {}),
        ...(motivo === 'JWKS_NO_DISPONIBLE'
          ? { remedio: 'revisa SUPABASE_JWKS_URL y consulta /ready' }
          : {}),
      });

      /**
       * Y tampoco se le miente al cliente. Un JWKS caído no es un token malo:
       * el cliente no tiene nada que corregir, y responderle 401 le dice que
       * vuelva a autenticarse —que es justo lo que no va a funcionar—. Se
       * responde 503, que es lo que de verdad ocurre y lo que ya publica
       * `/ready`. No revela nada: es un estado global del servicio, no una
       * distinción token a token que sirva para sondear.
       */
      if (esFalloDelServidor) {
        throw new ServiceUnavailableException(
          'La API no puede verificar sesiones en este momento. Consulta /ready.',
        );
      }

      // Para lo demás, al cliente un único mensaje. El motivo queda en la
      // bitácora: decirle a quien prueba tokens si falló la firma o la
      // expiración le ahorra trabajo de sondeo.
      throw new UnauthorizedException('No autenticado');
    }
  }
}
