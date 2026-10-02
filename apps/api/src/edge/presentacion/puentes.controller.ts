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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { RUTAS_DE_EQUIPOS, TUNELES_DE_EDGE } from '../../proveedores';
import type { RutasDeEquipos, TunelesDeEdge } from '../../proveedores';
import { REPOSITORIO_DE_PUENTES } from '../aplicacion/puentes';
import type { RepositorioDePuentes } from '../aplicacion/puentes';

export class FichaDeEdgeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ description: 'Los equipos del conjunto se operan por su túnel (ADR-035)' })
  puente!: boolean;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) puenteDesde!: string | null;
  @ApiProperty({ description: 'A3 · el túnel está abierto ahora' }) conectado!: boolean;
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Desde cuándo está conectado, o desde cuándo NO (null: no se ha visto)',
  })
  conexionDesde!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) ultimoLatido!: string | null;
  @ApiProperty() versionDeReglas!: number;
}

export class MarcaDePuenteDto {
  @ApiProperty({ description: 'true: los equipos pasan a operarse por este Edge' })
  @IsBoolean()
  puente!: boolean;
}

const fecha = (d: Date | null): string | null => (d === null ? null : d.toISOString());

/**
 * 15-Q2 · A3 · la ficha del Edge en la consola —«conectado / desconectado
 * desde…»— y la marca de PUENTE (ADR-035). Ver la ficha: quien administra la
 * copropiedad. Marcar el puente cambia por dónde salen TODAS las órdenes de sus
 * equipos: sólo el superadministrador, con su segundo factor (RN-20).
 */
@ApiTags('edge')
@ApiBearerAuth()
@Controller('copropiedades/:id/edge-gateways')
export class PuentesController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(REPOSITORIO_DE_PUENTES) private readonly puentes: RepositorioDePuentes,
    @Inject(TUNELES_DE_EDGE) private readonly tuneles: TunelesDeEdge,
    @Inject(RUTAS_DE_EQUIPOS) private readonly rutas: RutasDeEquipos,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  @Get()
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Los Edge del conjunto, con su conexión y si son el puente' })
  @ApiOkResponse({ type: [FichaDeEdgeDto] })
  @ApiForbiddenResponse()
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<FichaDeEdgeDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'edge-gateways');
    const tunel = this.tuneles.estadoDe(copropiedadId);
    return (await this.puentes.deCopropiedad(ctx, copropiedadId)).map((f) => {
      const suyo = tunel.edgeId === f.id;
      return {
        id: f.id,
        nombre: f.nombre,
        puente: f.puente,
        puenteDesde: fecha(f.puenteDesde),
        conectado: suyo && tunel.conectado,
        conexionDesde: suyo ? fecha(tunel.desde) : null,
        ultimoLatido: fecha(f.ultimoLatido),
        versionDeReglas: f.versionDeReglas,
      };
    });
  }

  @Post(':edgeId/puente')
  @HttpCode(200)
  @Roles('superadministrador')
  @ApiOperation({ summary: 'Marca (o desmarca) el Edge como puente de los equipos del conjunto' })
  @ApiOkResponse({ type: MarcaDePuenteDto })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Ya hay otro Edge puente en la copropiedad' })
  async marcar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('edgeId', ParseUUIDPipe) edgeId: string,
    @Body() dto: MarcaDePuenteDto,
  ): Promise<MarcaDePuenteDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'edge-gateways');
    const resultado = await this.puentes.marcar(
      ctx,
      copropiedadId,
      edgeId,
      dto.puente,
      this.reloj.ahora(),
    );
    if (resultado === 'no_encontrado') {
      throw new NotFoundException('No hay un Edge activo con ese identificador');
    }
    if (resultado === 'otro_puente') {
      throw new ConflictException('Ya hay otro Edge puente en esta copropiedad: desmárquelo antes');
    }
    this.rutas.olvidar();
    return { puente: dto.puente };
  }
}
