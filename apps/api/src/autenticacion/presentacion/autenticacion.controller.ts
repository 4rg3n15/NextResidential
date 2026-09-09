import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles, SinRecursoDeTenant } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../dominio/claims';
import { ROLES_ADMINISTRATIVOS } from '../dominio/claims';
import { SesionDto } from './respuestas';
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
}
