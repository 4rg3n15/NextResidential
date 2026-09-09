import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Alerta, Reloj } from '@ncr/domain-core';
import { RELOJ } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_ALERTAS } from '../aplicacion/puertos';
import type { RepositorioAlertas } from '../aplicacion/puertos';
import { NotasDeAlertaDto } from './dtos';
import { AlertaExpuestaDto } from './respuestas';
import { ErrorApiDto } from '../../comun/presentacion/respuestas';

/**
 * Cola de alertas del operador de central — RN-18, CA-18, KPI-25.
 *
 * El agregado NO se serializa crudo (§2.2): se expone un DTO. Devolver la
 * `Alerta` directamente publicaría la forma interna del agregado como si fuera
 * un contrato, y cualquier refactor del dominio rompería a los consumidores.
 */
@ApiTags('alertas')
@ApiBearerAuth()
@Controller('copropiedades/:id/alertas')
export class AlertasController {
  constructor(
    @Inject(REPOSITORIO_ALERTAS) private readonly alertas: RepositorioAlertas,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Roles('operador_central', 'administrador', 'superadministrador', 'portero')
  @ApiOperation({ summary: 'Alertas abiertas y en atención, con su cumplimiento de KPI-25' })
  @ApiOkResponse({ type: [AlertaExpuestaDto] })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async abiertas(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<readonly AlertaExpuestaDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'alertas');
    return (await this.alertas.abiertasDe(copropiedadId)).map(exponer);
  }

  @Post(':alertaId/atencion')
  @Roles('operador_central', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'El operador toma la alerta; queda atribuida a él' })
  @ApiCreatedResponse({ type: AlertaExpuestaDto })
  @ApiConflictResponse({ type: ErrorApiDto, description: 'La alerta ya está atendida o resuelta' })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async atender(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('alertaId', ParseUUIDPipe) alertaId: string,
  ): Promise<AlertaExpuestaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'alertas/atencion');
    const alerta = await this.buscar(copropiedadId, alertaId);

    const atendida = alerta.atender(ctx.usuarioId, this.reloj.ahora());
    if (!atendida.ok) throw new ConflictException(atendida.error.detalle);
    await this.alertas.guardar(atendida.valor, ctx.usuarioId);
    return exponer(atendida.valor);
  }

  @Post(':alertaId/resolucion')
  @Roles('operador_central', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Cierra la alerta; las notas son obligatorias' })
  @ApiCreatedResponse({ type: AlertaExpuestaDto })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async resolver(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('alertaId', ParseUUIDPipe) alertaId: string,
    @Body() dto: NotasDeAlertaDto,
  ): Promise<AlertaExpuestaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'alertas/resolucion');
    const alerta = await this.buscar(copropiedadId, alertaId);

    const resuelta = alerta.resolver(this.reloj.ahora(), dto.notas);
    if (!resuelta.ok) throw new BadRequestException(resuelta.error.detalle);
    await this.alertas.guardar(resuelta.valor, ctx.usuarioId);
    return exponer(resuelta.valor);
  }

  private async buscar(copropiedadId: string, alertaId: string): Promise<Alerta> {
    const alerta = await this.alertas.porId(copropiedadId, alertaId);
    if (alerta === null) throw new NotFoundException('Alerta no encontrada');
    return alerta;
  }
}

const exponer = (a: Alerta): AlertaExpuestaDto => ({
  id: a.id,
  tipo: a.tipo,
  severidad: a.severidad,
  estado: a.estado,
  generadaEn: a.generadaEn.toISOString(),
  escaladaEn: a.escaladaEn === null ? null : a.escaladaEn.toISOString(),
  eventoId: a.eventoId,
  dispositivoId: a.dispositivoId,
  escaladaDentroDelPlazo: a.escaladaDentroDelPlazo(),
  notas: a.notas,
});
