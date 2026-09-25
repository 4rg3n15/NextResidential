import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PermitidaDuranteElPatrullaje,
  PermitidaFueraDeTurno,
  Roles,
  SinRecursoDeTenant,
} from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Patrullaje } from '../aplicacion/patrullaje';
import { GestionDePorteros } from '../aplicacion/porteros';
import { DesbloqueoDto, EstadoDeSesionDto, PorteroDto, ResultadoDeDesbloqueoDto } from './dtos';
import { aPorteroDto } from './mapeadores';

const identidad = (ctx: ContextoTenant) => ({
  copropiedadId: ctx.copropiedadId,
  usuarioId: ctx.usuarioId,
  sesionId: ctx.sesionId,
});

/**
 * LA CONSOLA DEL PORTERO · su sesión, su patrullaje y su perfil (ADR-024).
 *
 * Todo sobre la identidad del propio llamante: ninguna ruta recibe un
 * identificador de copropiedad ni de otra persona. El perfil es de SOLO
 * LECTURA —no existe ruta que lo edite por él, y la base se lo impide también
 * (`tg_usuario_campos_propios`)—.
 */
@ApiTags('porteria')
@ApiBearerAuth()
@Roles('portero')
@SinRecursoDeTenant()
@Controller('porteria')
export class PorteriaController {
  constructor(
    @Inject(Patrullaje) private readonly patrullaje: Patrullaje,
    @Inject(GestionDePorteros) private readonly porteros: GestionDePorteros,
  ) {}

  @Get('sesion')
  @PermitidaDuranteElPatrullaje()
  @PermitidaFueraDeTurno()
  @ApiOperation({
    summary: 'Estado de la sesión: activa (con código), patrullaje, cerrada o fuera de turno',
  })
  @ApiOkResponse({ type: EstadoDeSesionDto })
  async sesion(@Contexto() ctx: ContextoTenant): Promise<EstadoDeSesionDto> {
    const e = await this.patrullaje.estado(identidad(ctx));
    return { ...e };
  }

  @Post('sesion/patrullaje')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pone la sesión en patrullaje: la API rechaza toda acción hasta el código',
  })
  @ApiOkResponse({ type: EstadoDeSesionDto })
  async iniciarPatrullaje(@Contexto() ctx: ContextoTenant): Promise<EstadoDeSesionDto> {
    await this.patrullaje.iniciar(identidad(ctx));
    return { ...(await this.patrullaje.estado(identidad(ctx))) };
  }

  @Post('sesion/desbloqueo')
  @HttpCode(200)
  @PermitidaDuranteElPatrullaje()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Termina el patrullaje con el código; el 5.º fallo cierra la sesión' })
  @ApiOkResponse({ type: ResultadoDeDesbloqueoDto })
  async desbloqueo(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: DesbloqueoDto,
    @Req() peticion: Request,
  ): Promise<ResultadoDeDesbloqueoDto> {
    const [esquema, token] = (peticion.headers.authorization ?? '').split(' ');
    const resultado = await this.patrullaje.desbloquear(
      identidad(ctx),
      dto.codigo,
      esquema?.toLowerCase() === 'bearer' && token ? token : null,
    );
    return { resultado };
  }

  @Get('perfil')
  @ApiOperation({ summary: 'El perfil del propio portero, de solo lectura' })
  @ApiOkResponse({ type: PorteroDto })
  async miPerfil(@Contexto() ctx: ContextoTenant): Promise<PorteroDto> {
    const ficha = await this.porteros.miPerfil(ctx);
    if (ficha === null) throw new NotFoundException('No hay perfil de portero para esta cuenta');
    return aPorteroDto(ficha);
  }
}
