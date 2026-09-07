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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServicioMfa } from '../infraestructura/mfa.servicio';
import { InscribirMfaDto, VerificarMfaDto } from './dtos';
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
  sesion(@Contexto() ctx: ContextoTenant): {
    usuarioId: string;
    rol: string;
    copropiedadId: string | null;
    copropiedadesAtendidas: readonly string[];
    mfaVerificado: boolean;
  } {
    return {
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadId: ctx.copropiedadId,
      copropiedadesAtendidas: ctx.copropiedadesAtendidas,
      mfaVerificado: ctx.mfaVerificado,
    };
  }

  @Post('mfa/inscripcion')
  @Roles(...ROLES_ADMINISTRATIVOS)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Alta de TOTP; devuelve los códigos de recuperación una sola vez' })
  inscribir(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: InscribirMfaDto,
  ): { uriOtpauth: string; codigosDeRecuperacion: string[] } {
    const { uriOtpauth, codigos } = this.mfa.inscribir(ctx.usuarioId, dto.correo);
    return { uriOtpauth, codigosDeRecuperacion: codigos };
  }

  @Post('mfa/verificacion')
  @HttpCode(200)
  @Roles(...ROLES_ADMINISTRATIVOS)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verifica un TOTP o consume un código de recuperación' })
  verificar(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: VerificarMfaDto,
  ): { verificado: true; codigosRestantes: number } {
    if (!this.mfa.verificar(ctx.usuarioId, dto.codigo)) {
      // Mismo mensaje para código erróneo y para inscripción inexistente.
      throw new UnauthorizedException('Código no válido');
    }
    return { verificado: true, codigosRestantes: this.mfa.codigosRestantes(ctx.usuarioId) };
  }
}
