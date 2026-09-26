import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  PermiteCambioPendiente,
  PermitidaDuranteElPatrullaje,
  PermitidaFueraDeTurno,
  Publico,
  Roles,
  SinRecursoDeTenant,
  SinSegundoFactor,
} from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import { ErrorApiDto } from '../../comun/respuestas';
import { ROLES_ADMINISTRATIVOS } from '../../autenticacion';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { IniciarSesion } from '../aplicacion/iniciar-sesion';
import { CambiarContrasena } from '../aplicacion/cambiar-contrasena';
import { RestablecerContrasena } from '../aplicacion/restablecer-contrasena';
import { CerrarSesion } from '../aplicacion/cerrar-sesion';
import type { OrigenDeAcceso } from '../aplicacion/puertos';
import {
  AccesoDto,
  CambioDeContrasenaDto,
  HechoDeCuentaDto,
  RestablecimientoDeContrasenaDto,
  SesionDeAccesoDto,
} from './dtos';
import {
  CABECERA_AGENTE,
  LIMITE_POR_DIRECCION,
  LimitadaComoAcceso,
  origenDeclarado,
} from './limites-de-acceso';

/** Texto ÚNICO de un fallo de credenciales: no dice qué parte falló. */
export const MENSAJE_CREDENCIALES = 'Usuario, NIT o contraseña incorrectos';

const origenDe = (peticion: Request): OrigenDeAcceso => {
  const cabeceras = peticion.headers as Record<string, unknown>;
  const agente = cabeceras[CABECERA_AGENTE] ?? cabeceras['user-agent'];
  return {
    ip: peticion.ip ?? null,
    declarado: origenDeclarado(cabeceras),
    agente: typeof agente === 'string' ? agente.slice(0, 300) : null,
  };
};

const tokenDe = (peticion: Request): string | null => {
  const [esquema, token] = (peticion.headers.authorization ?? '').split(' ');
  return esquema?.toLowerCase() === 'bearer' && token ? token : null;
};

/**
 * CUENTAS · entrada por usuario, primer ingreso y restablecimiento (ADR-023).
 *
 * Ninguna respuesta de este controlador contiene un correo —sintético o real—
 * ni una contraseña. La suite lo comprueba sobre los cuerpos reales.
 */
@ApiTags('cuentas')
@Controller()
export class CuentasController {
  constructor(
    @Inject(IniciarSesion) private readonly iniciar: IniciarSesion,
    @Inject(CambiarContrasena) private readonly cambiar: CambiarContrasena,
    @Inject(RestablecerContrasena) private readonly restablecer: RestablecerContrasena,
    @Inject(CerrarSesion) private readonly cerrar: CerrarSesion,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Post('auth/acceso')
  @HttpCode(200)
  @Publico()
  @LimitadaComoAcceso()
  @Throttle({ default: { limit: LIMITE_POR_DIRECCION, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicio de sesión por correo o por NIT y usuario' })
  @ApiOkResponse({ type: SesionDeAccesoDto })
  @ApiUnauthorizedResponse({ type: ErrorApiDto, description: MENSAJE_CREDENCIALES })
  @ApiForbiddenResponse({
    type: ErrorApiDto,
    description: 'Contraseña correcta, pero la sesión no se concede (sin rol, fuera de turno)',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorApiDto,
    description: '5/min por cuenta, 10/min por origen declarado, 30/min por dirección (S-50)',
  })
  async acceso(@Body() dto: AccesoDto, @Req() peticion: Request): Promise<SesionDeAccesoDto> {
    const r = await this.iniciar.ejecutar(
      dto.correo !== undefined
        ? { tipo: 'correo', correo: dto.correo }
        : { tipo: 'usuario', nit: dto.nit ?? '', usuario: dto.usuario ?? '' },
      dto.contrasena,
      origenDe(peticion),
    );
    if (!r.ok) {
      if (r.error.motivo === 'CREDENCIALES') throw new UnauthorizedException(MENSAJE_CREDENCIALES);
      if (r.error.motivo === 'SIN_ACCESO') {
        throw new ForbiddenException('La cuenta no tiene un acceso habilitado');
      }
      throw new ForbiddenException(r.error.detalle);
    }
    return {
      accessToken: r.valor.accessToken,
      refreshToken: r.valor.refreshToken,
      expiraEn: r.valor.expiraEn,
      debeCambiarContrasena: r.valor.debeCambiarContrasena,
    };
  }

  @Post('auth/contrasena')
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @PermiteCambioPendiente()
  @SinSegundoFactor()
  @SinRecursoDeTenant()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cambia la propia contraseña; cierra el primer ingreso' })
  @ApiOkResponse({ type: HechoDeCuentaDto })
  @ApiBadRequestResponse({
    type: ErrorApiDto,
    description: 'Política, igual a la actual o actual incorrecta',
  })
  @ApiForbiddenResponse({ type: ErrorApiDto, description: 'Rol administrativo sin segundo factor' })
  async contrasena(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: CambioDeContrasenaDto,
    @Req() peticion: Request,
  ): Promise<HechoDeCuentaDto> {
    const r = await this.cambiar.ejecutar(ctx, dto.actual, dto.nueva, origenDe(peticion));
    if (r.ok) return { hecho: 'contrasena_cambiada' };
    switch (r.error.motivo) {
      case 'POLITICA':
        throw new BadRequestException(r.error.detalle);
      case 'IGUAL':
        throw new BadRequestException('La nueva contraseña no puede ser igual a la actual');
      case 'ACTUAL_INCORRECTA':
        throw new BadRequestException('La contraseña actual no es correcta');
      case 'SEGUNDO_FACTOR':
        throw new ForbiddenException('Complete el segundo factor antes de cambiar la contraseña');
      case 'SIN_CUENTA':
        throw new ForbiddenException('La cuenta no admite el cambio de contraseña');
    }
  }

  @Post('auth/cierre')
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles(...ROLES_ADMINISTRATIVOS, 'portero', 'residente')
  @PermiteCambioPendiente()
  @PermitidaDuranteElPatrullaje()
  @PermitidaFueraDeTurno()
  @SinSegundoFactor()
  @SinRecursoDeTenant()
  @ApiOperation({ summary: 'Cierra la sesión del token presentado' })
  @ApiOkResponse({ type: HechoDeCuentaDto })
  async cierre(
    @Contexto() ctx: ContextoTenant,
    @Req() peticion: Request,
  ): Promise<HechoDeCuentaDto> {
    await this.cerrar.ejecutar(ctx, tokenDe(peticion));
    return { hecho: 'sesion_cerrada' };
  }

  @Post('copropiedades/:id/usuarios/:usuarioId/restablecimiento')
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles('superadministrador', 'administrador')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Restablece la contraseña de una cuenta con una temporal y cambio obligatorio',
  })
  @ApiOkResponse({ type: HechoDeCuentaDto })
  @ApiBadRequestResponse({ type: ErrorApiDto, description: 'La temporal no cumple la política' })
  @ApiForbiddenResponse({ type: ErrorApiDto, description: 'Su rol no restablece a esa cuenta' })
  async restablecimiento(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: RestablecimientoDeContrasenaDto,
    @Req() peticion: Request,
  ): Promise<HechoDeCuentaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'cuentas/restablecimiento');
    const r = await this.restablecer.ejecutar(
      ctx,
      copropiedadId,
      usuarioId,
      dto.temporal,
      origenDe(peticion),
    );
    if (r.ok) return { hecho: 'contrasena_restablecida' };
    if (r.error.motivo === 'NO_ENCONTRADO') throw new NotFoundException('Cuenta no encontrada');
    if (r.error.motivo === 'POLITICA') throw new BadRequestException(r.error.detalle);
    throw new ForbiddenException(r.error.detalle);
  }
}
