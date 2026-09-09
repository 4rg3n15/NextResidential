import { Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles, SinRecursoDeTenant, SinSegundoFactor } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import { REGISTRO_AUDITORIA } from '../../multiempresa/aislamiento';
import type { RegistroDeAuditoria } from '../../multiempresa/aislamiento';
import type { ContextoTenant } from '../dominio/claims';
import { ROLES_ADMINISTRATIVOS } from '../dominio/claims';
import { RestablecimientoRegistradoDto, SesionDto } from './respuestas';
import { ErrorApiDto } from '../../comun/respuestas';

/**
 * Identidad y alcance del token presentado.
 *
 * **Aquí ya no hay rutas de segundo factor, y esa es la decisión (ADR-008).**
 * Hasta la ETAPA 09-A este controlador exponía `/auth/mfa/inscripcion` y
 * `/auth/mfa/verificacion` con TOTP propio. Eran **inalcanzables**: el guard de
 * autenticación exige `aal2` antes de que actúe el de roles, y las dos rutas
 * exigían rol administrativo, así que un administrador sin segundo factor no
 * podía llegar a inscribirlo. Y aunque hubiera podido, verificar ahí no habría
 * cambiado el `aal` del token —lo emite Supabase—, con lo que tampoco habría
 * desbloqueado nada.
 *
 * Mantener dos fuentes de verdad para el segundo factor es pedir un incidente:
 * una diría que el usuario tiene MFA y la otra que no, y la que decide es la
 * que emite el claim. Supabase Auth es la autoritativa; lo demás se retira en
 * vez de quedarse protegido e inalcanzable, que en la auditoría de la ETAPA 13
 * habría sido un hallazgo seguro.
 *
 * `ROLES_ADMINISTRATIVOS` sigue aquí porque es el conjunto que `aal2` protege:
 * lo aplica el guard, no una ruta.
 */
@ApiTags('autenticacion')
@ApiBearerAuth()
// Opera sobre la identidad del propio llamante: no devuelve ni escribe datos de
// ninguna copropiedad.
@SinRecursoDeTenant()
@Controller('auth')
export class AutenticacionController {
  constructor(@Inject(REGISTRO_AUDITORIA) private readonly auditoria: RegistroDeAuditoria) {}

  @Get('sesion')
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @ApiOperation({ summary: 'Identidad y alcance del token presentado' })
  @ApiOkResponse({ type: SesionDto })
  @ApiUnauthorizedResponse({
    type: ErrorApiDto,
    description:
      'Token ausente, caducado o inválido. También cuando un rol administrativo presenta ' +
      'un token `aal1`: está autenticado, pero no habilitado (RN-20, CA-25).',
  })
  sesion(@Contexto() ctx: ContextoTenant): SesionDto {
    return {
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadId: ctx.copropiedadId,
      copropiedadesAtendidas: [...ctx.copropiedadesAtendidas],
      mfaVerificado: ctx.mfaVerificado,
    };
  }

  /**
   * Deja constancia de que el llamante acaba de restablecer su contraseña.
   *
   * **El cambio de contraseña NO pasa por aquí.** Lo ejecuta Supabase Auth,
   * que es el proveedor autoritativo (ADR-008). Lo que pasa por aquí es el
   * rastro: un cambio de credencial es un hecho auditable (§2.7.8), y si la
   * única huella viviera en los registros de Supabase quedaría fuera del
   * sistema que el operador audita durante un incidente.
   *
   * **`@SinSegundoFactor()` y por qué.** Tras restablecer, la sesión que emite
   * el proveedor es `aal1`: el usuario acaba de demostrar el control del buzón,
   * no el del segundo factor. Sin la exención, un administrador nunca podría
   * registrar su propio restablecimiento — el mismo callejón sin salida que
   * hizo inalcanzables las rutas de MFA retiradas en ADR-008. La ruta no expone
   * ningún recurso de copropiedad ni permite operar: solo escribe sobre quien
   * llama.
   *
   * **Idempotente y sin cuerpo.** No recibe nada del cliente: la identidad sale
   * del token verificado. Un cuerpo con «quién restableció» sería un cuerpo que
   * el cliente controla, y la auditoría dejaría de significar nada.
   */
  @Post('restablecimiento')
  @HttpCode(204)
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @SinSegundoFactor()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra en auditoría el restablecimiento de la propia contraseña' })
  @ApiNoContentResponse({ type: RestablecimientoRegistradoDto })
  @ApiTooManyRequestsResponse({ type: ErrorApiDto, description: '5 por minuto (§2.7.5)' })
  async registrarRestablecimiento(
    @Contexto() ctx: ContextoTenant,
    @Req() peticion: Request,
  ): Promise<void> {
    await this.auditoria.registrarRestablecimiento({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      // `ip` y `user-agent` son del transporte, así que se leen aquí y no en el
      // caso de uso. Se admiten nulos: detrás de un proxy pueden no llegar, y
      // un registro sin IP sigue siendo mejor que ningún registro.
      ip: peticion.ip ?? null,
      userAgent: peticion.headers['user-agent'] ?? null,
    });
  }
}
