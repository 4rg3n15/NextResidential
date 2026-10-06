import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { TopeDePlazasDeVivienda } from '../aplicacion/plazas-del-titular';
import { TopeDePlazasPorOmision } from '../aplicacion/tope-de-la-copropiedad';
import {
  CambioDeTopeDePlazasDto,
  CambioDeTopePorOmisionDto,
  TopeDePlazasDto,
  TopePorOmisionDto,
} from './dtos-plazas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL TOPE DE PLAZAS DE UNA VIVIENDA · SÓLO EL SUPERADMINISTRADOR (D-W10, D4 bis)
 *
 * La ficha de la vivienda de la consola muestra «Plazas: 3 de 4» y «Cambiar
 * tope». El tope nunca queda por debajo de las plazas activas: lo garantiza la
 * base (`viviendas_tope_bajo_las_plazas`, 0056), y aquí se traduce a 409. Todo
 * cambio queda en la bitácora con su motivo. 10 por minuto (§7).
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residentes')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/viviendas/:viviendaId/tope-de-plazas')
export class TopeDePlazasController {
  constructor(
    @Inject(TopeDePlazasDeVivienda) private readonly topes: TopeDePlazasDeVivienda,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Plazas activas y tope de la vivienda (D-W10)' })
  @ApiOkResponse({ type: TopeDePlazasDto })
  async ver(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('viviendaId', ParseUUIDPipe) viviendaId: string,
  ): Promise<TopeDePlazasDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'viviendas/tope-de-plazas');
    const c = await this.topes.cupo(id, viviendaId, ctx.usuarioId);
    if (c.tope === 0) throw new NotFoundException('Vivienda no encontrada');
    return { tope: c.tope, activas: c.activas, propio: c.topePropio };
  }

  @Put()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cambia el tope de plazas de la vivienda, con motivo (D-W10)' })
  @ApiOkResponse({ type: TopeDePlazasDto })
  async cambiar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('viviendaId', ParseUUIDPipe) viviendaId: string,
    @Body() dto: CambioDeTopeDePlazasDto,
  ): Promise<TopeDePlazasDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'viviendas/tope-de-plazas');
    const r = await this.topes.cambiar(destino, id, viviendaId, {
      tope: dto.tope ?? null,
      motivo: dto.motivo.trim(),
    });
    if (r === 'NO_ENCONTRADA') throw new NotFoundException('Vivienda no encontrada');
    if (r === 'BAJO_LAS_PLAZAS') {
      throw new ConflictException('El tope no puede quedar por debajo de las plazas activas');
    }
    return this.ver(destino, id, viviendaId);
  }
}

/** D4 bis · el tope por omisión de la copropiedad, desde Configuración (superadministrador). */
@ApiTags('residentes')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/tope-de-plazas')
export class TopeDePlazasPorOmisionController {
  constructor(
    @Inject(TopeDePlazasPorOmision) private readonly topes: TopeDePlazasPorOmision,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Tope de plazas por vivienda de la copropiedad (D-W10)' })
  @ApiOkResponse({ type: TopePorOmisionDto })
  async ver(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TopePorOmisionDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'tope-de-plazas');
    const tope = await this.topes.ver(id);
    if (tope === null) throw new NotFoundException('Copropiedad no encontrada');
    return { tope };
  }

  @Put()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cambia el tope por omisión; nadie pierde plazas si baja (D-W10)' })
  @ApiOkResponse({ type: TopePorOmisionDto })
  async cambiar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambioDeTopePorOmisionDto,
  ): Promise<TopePorOmisionDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'tope-de-plazas');
    if (!(await this.topes.cambiar(destino, id, dto.tope, dto.motivo.trim()))) {
      throw new NotFoundException('Copropiedad no encontrada');
    }
    return { tope: dto.tope };
  }
}
