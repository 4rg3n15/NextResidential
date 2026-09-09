import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ServicioMfa } from '../infraestructura/mfa.servicio';
import { InscribirMfaDto, VerificarMfaDto } from './dtos';
import { InscripcionMfaDto, SesionDto, VerificacionMfaDto } from './respuestas';
import { ErrorApiDto } from '../../comun/respuestas';
import { Roles, SinRecursoDeTenant } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../dominio/claims';
import { ROLES_ADMINISTRATIVOS } from '../dominio/claims';

/**
 * Rutas de sesión y segundo factor.
 *
 * El límite endurecido de §2.7.5 se aplica AQUÍ y no solo globalmente: seis
 * dígitos son 10^6 combinaciones, y con el límite global de 120/min un atacante
 * las recorrería en horas. Con 5 intentos por minuto, en siglos.
 */
@ApiTags('autenticacion')
@ApiBearerAuth()
// Todo este controlador opera sobre la identidad del propio llamante: no
// devuelve ni escribe datos de ninguna copropiedad.
@SinRecursoDeTenant()
@Controller('auth')
export class AutenticacionController {
  constructor(@Inject(ServicioMfa) private readonly mfa: ServicioMfa) {}

  @Get('sesion')
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @ApiOperation({ summary: 'Identidad y alcance del token presentado' })
  @ApiOkResponse({ type: SesionDto })
  @ApiUnauthorizedResponse({ type: ErrorApiDto, description: 'Token ausente, caducado o inválido' })
  sesion(@Contexto() ctx: ContextoTenant): SesionDto {
    return {
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadId: ctx.copropiedadId,
      copropiedadesAtendidas: [...ctx.copropiedadesAtendidas],
      mfaVerificado: ctx.mfaVerificado,
    };
  }

  @Post('mfa/inscripcion')
  @Roles(...ROLES_ADMINISTRATIVOS)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Alta de TOTP; devuelve los códigos de recuperación una sola vez' })
  @ApiCreatedResponse({ type: InscripcionMfaDto })
  @ApiTooManyRequestsResponse({ type: ErrorApiDto, description: '5 intentos por minuto (§2.7.5)' })
  inscribir(@Contexto() ctx: ContextoTenant, @Body() dto: InscribirMfaDto): InscripcionMfaDto {
    const { uriOtpauth, codigos } = this.mfa.inscribir(ctx.usuarioId, dto.correo);
    return { uriOtpauth, codigosDeRecuperacion: codigos };
  }

  @Post('mfa/verificacion')
  @HttpCode(200)
  @Roles(...ROLES_ADMINISTRATIVOS)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verifica un TOTP o consume un código de recuperación' })
  @ApiOkResponse({ type: VerificacionMfaDto })
  @ApiUnauthorizedResponse({
    type: ErrorApiDto,
    description: 'Mismo mensaje para código erróneo y para inscripción inexistente',
  })
  @ApiTooManyRequestsResponse({ type: ErrorApiDto, description: '5 intentos por minuto (§2.7.5)' })
  verificar(@Contexto() ctx: ContextoTenant, @Body() dto: VerificarMfaDto): VerificacionMfaDto {
    if (!this.mfa.verificar(ctx.usuarioId, dto.codigo)) {
      // Mismo mensaje para código erróneo y para inscripción inexistente.
      throw new UnauthorizedException('Código no válido');
    }
    return { verificado: true, codigosRestantes: this.mfa.codigosRestantes(ctx.usuarioId) };
  }
}
