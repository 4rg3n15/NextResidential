import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { ALCANCE_DE_EQUIPOS } from '../../equipos';
import type { AlcanceDeEquipos } from '../../equipos';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { ErrorApiDto } from '../../comun/respuestas';
import { FijarModoDePuerta } from '../aplicacion/fijar-modo-de-puerta';
import type { OrdenDeModoCumplida } from '../aplicacion/fijar-modo-de-puerta';
import {
  AJUSTES_DE_PUERTAS,
  REGISTRO_DE_MODOS,
  TOPE_DE_PLATAFORMA_MIN,
} from '../aplicacion/modo-de-puerta';
import type { AjustesDePuertas, RegistroDeModosDePuerta } from '../aplicacion/modo-de-puerta';
import {
  AjustesDePuertasDto,
  ModosVigentesDto,
  OrdenDeModoCumplidaDto,
  OrdenDeModoDto,
  ReversionDeModoDto,
} from './dtos-modos';

const desenvolver = (r: Resultado<OrdenDeModoCumplida, ErrorDominio>): OrdenDeModoCumplidaDto => {
  if (!r.ok) {
    if (r.error.codigo === 'OPERACION_NO_PERMITIDA') throw new ForbiddenException(r.error.detalle);
    throw new BadRequestException(r.error.detalle);
  }
  return { ...r.valor, revierteEn: r.valor.revierteEn?.toISOString() ?? null };
};

/**
 * 15-R · P-25 · puerta libre o bloqueada (C1–C5). El rol lo declara `@Roles`
 * —administrador y superadministrador— y el caso de uso lo vuelve a exigir.
 * Ver `aplicacion/modo-de-puerta.ts`.
 */
@ApiTags('guardia')
@ApiBearerAuth()
@Controller('copropiedades/:id/puertas')
export class ModosDePuertaController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(ALCANCE_DE_EQUIPOS) private readonly equiposDeLaRuta: AlcanceDeEquipos,
    @Inject(FijarModoDePuerta) private readonly ordenes: FijarModoDePuerta,
    @Inject(REGISTRO_DE_MODOS) private readonly registro: RegistroDeModosDePuerta,
    @Inject(AJUSTES_DE_PUERTAS) private readonly ajustes: AjustesDePuertas,
  ) {}

  @Get('modos')
  @Roles('portero', 'operador_central', 'administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Puertas libres o bloqueadas ahora: quién, por qué, desde y hasta cuándo',
  })
  @ApiOkResponse({ type: ModosVigentesDto })
  async vigentes(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ModosVigentesDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'puertas/modos');
    const vigentes = await this.registro.vigentes(copropiedadId);
    return {
      modos: vigentes.map((v) => ({
        id: v.id,
        dispositivoId: v.dispositivoId,
        numeroDePuerta: v.numeroDePuerta,
        modo: v.modo,
        motivo: v.motivo,
        operadorId: v.operadorId,
        operadorNombre: v.operadorNombre,
        rol: v.rol,
        desde: v.ordenadaEn.toISOString(),
        revierteEn: v.revierteEn.toISOString(),
        resultado: v.resultado,
        reversionesFallidas: v.reversionesFallidas,
      })),
    };
  }

  @Post('modos')
  @Roles('administrador', 'superadministrador')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Deja una puerta libre o bloqueada, con motivo y plazo (P-25)' })
  @ApiCreatedResponse({ type: OrdenDeModoCumplidaDto })
  @ApiForbiddenResponse({ type: ErrorApiDto, description: 'Sólo la administración' })
  async fijar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: OrdenDeModoDto,
  ): Promise<OrdenDeModoCumplidaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'puertas/modos');
    await this.equiposDeLaRuta.exigir(ctx, copropiedadId, dto.dispositivoId, 'puertas/modos');
    return desenvolver(await this.ordenes.fijar(ctx, { ...dto, copropiedadId }));
  }

  @Post('modos/reversion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Revertir ahora: la puerta vuelve a su modo normal' })
  @ApiCreatedResponse({ type: OrdenDeModoCumplidaDto })
  async revertir(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: ReversionDeModoDto,
  ): Promise<OrdenDeModoCumplidaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'puertas/modos');
    await this.equiposDeLaRuta.exigir(ctx, copropiedadId, dto.dispositivoId, 'puertas/modos');
    return desenvolver(
      await this.ordenes.revertirAhora(ctx, { ...dto, motivo: dto.motivo, copropiedadId }),
    );
  }

  @Get('ajustes')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Duración máxima de una puerta libre o bloqueada' })
  @ApiOkResponse({ type: AjustesDePuertasDto })
  async verAjustes(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<AjustesDePuertasDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'puertas/ajustes');
    return { duracionMaximaMinutos: await this.ajustes.duracionMaxima(copropiedadId) };
  }

  @Put('ajustes')
  @HttpCode(200)
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: `Fija la duración máxima (15 a ${String(TOPE_DE_PLATAFORMA_MIN)} min)` })
  @ApiOkResponse({ type: AjustesDePuertasDto })
  async fijarAjustes(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AjustesDePuertasDto,
  ): Promise<AjustesDePuertasDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'puertas/ajustes');
    await this.ajustes.fijarDuracionMaxima(copropiedadId, dto.duracionMaximaMinutos, ctx.usuarioId);
    return { duracionMaximaMinutos: dto.duracionMaximaMinutos };
  }
}
