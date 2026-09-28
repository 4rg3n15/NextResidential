import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { CupoDePorteros } from '../aplicacion/cupo-de-porteros';
import { GestionDePorteros } from '../aplicacion/porteros';
import { HechoDePorteriaDto } from './dtos';
import { BajaDePorteroDto, CupoDePorterosDto, PoolDePorterosDto } from './dtos-de-pool';
import { rechazoDePortero } from './rechazo-de-portero';

/**
 * H1 · H2 (15-L, ADR-031) · EL POOL DE NÚMEROS, EL CUPO Y LA BAJA.
 *
 * Del superadministrador, como todo el panel de supervisión. El cupo se hace
 * cumplir en la base al asignar cada número; la baja libera una plaza del cupo
 * pero NO devuelve el número al pool.
 */
@ApiTags('porteria')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/porteros')
export class PoolDePorterosController {
  constructor(
    @Inject(CupoDePorteros) private readonly cupo: CupoDePorteros,
    @Inject(GestionDePorteros) private readonly porteros: GestionDePorteros,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('pool')
  @ApiOperation({
    summary: 'Pool de números de portero de la copropiedad, el siguiente a asignar y el cupo',
  })
  @ApiOkResponse({ type: PoolDePorterosDto })
  async pool(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PoolDePorterosDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/pool');
    const estado = await this.cupo.estado(id);
    if (estado === null) throw new NotFoundException('La copropiedad no tiene pool de porteros');
    return estado;
  }

  @Put('cupo')
  @ApiOperation({ summary: 'Cupo de porteros activos de la copropiedad (0 a 999), auditado' })
  @ApiOkResponse({ type: HechoDePorteriaDto })
  async fijarCupo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CupoDePorterosDto,
  ): Promise<HechoDePorteriaDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/cupo');
    const r = await this.cupo.fijar(ctx, id, dto.cupo);
    if (!r.ok) throw new NotFoundException('La copropiedad no tiene pool de porteros');
    return { hecho: 'cupo_actualizado' };
  }

  @Post(':usuarioId/baja')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Da de baja a un portero: cierra sus sesiones y su número no se reutiliza',
  })
  @ApiOkResponse({ type: HechoDePorteriaDto })
  async baja(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: BajaDePorteroDto,
  ): Promise<HechoDePorteriaDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'porteria/baja');
    const r = await this.porteros.desactivar(ctx, id, usuarioId, dto.motivo);
    if (!r.ok) throw rechazoDePortero(r.error);
    return { hecho: 'portero_dado_de_baja' };
  }
}
