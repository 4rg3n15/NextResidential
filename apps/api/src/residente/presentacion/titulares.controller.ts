import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { TitularesDeViviendas, VIVIENDA_CON_TITULAR } from '../aplicacion/titulares-y-registro';
import {
  AsignacionDeViviendaDto,
  ViviendaAsignadaDto,
  ViviendaSinTitularDto,
} from './dtos-titulares';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS TITULARES DE LAS VIVIENDAS · SÓLO EL SUPERADMINISTRADOR · RONDA 15-W (D1)
 *
 * Elegir vivienda para un titular nuevo —entre las activas sin titular— y dar
 * su vivienda a una cuenta ANTIGUA que no la tiene, con motivo en la bitácora.
 * Aparte de `supervision-de-residentes.controller.ts` para no pasar de cinco
 * rutas por clase (§2.3); rutas y `operationId` son los de allí, así que el
 * contrato y los clientes generados no cambian. Cada ruta pasa por
 * `exigirAlcance` antes de tocar nada.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residentes')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/residentes')
export class TitularesController {
  constructor(
    @Inject(TitularesDeViviendas) private readonly titulares: TitularesDeViviendas,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  /** La vivienda de una cuenta ANTIGUA que no la tiene: queda de titular. */
  @Post('cuentas/:usuarioId/vivienda')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'SupervisionDeResidentesController_asignarVivienda',
    summary: 'Asigna su vivienda a una cuenta antigua, como titular (D1)',
  })
  @ApiOkResponse({ type: ViviendaAsignadaDto })
  async asignarVivienda(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: AsignacionDeViviendaDto,
  ): Promise<ViviendaAsignadaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'residentes/cuentas');
    const r = await this.titulares.asignarVivienda(destino, id, usuarioId, {
      viviendaId: dto.viviendaId,
      motivo: dto.motivo.trim(),
    });
    if (r === 'ASIGNADA') return { asignada: true };
    if (r === 'CUENTA_INEXISTENTE') throw new NotFoundException('Cuenta no encontrada');
    if (r === 'CUENTA_CON_VIVIENDA') throw new ConflictException('Esa cuenta ya tiene vivienda');
    if (r === 'CON_TITULAR') throw new ConflictException(VIVIENDA_CON_TITULAR);
    throw new NotFoundException('Vivienda no encontrada');
  }

  @Get('viviendas-sin-titular')
  @ApiOperation({
    operationId: 'SupervisionDeResidentesController_viviendasSinTitular',
    summary: 'Viviendas activas sin titular, por número o agrupación (D1)',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Número o agrupación; vacío = todas (50 como máximo)',
  })
  @ApiOkResponse({ type: [ViviendaSinTitularDto] })
  async viviendasSinTitular(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('q') q?: string,
  ): Promise<ViviendaSinTitularDto[]> {
    await this.aislamiento.exigirAlcance(ctx, id, 'residentes/cuentas');
    const busqueda = typeof q === 'string' ? q.slice(0, 60) : null;
    return (await this.titulares.viviendasSinTitular(id, busqueda)).map((v) => ({ ...v }));
  }
}
