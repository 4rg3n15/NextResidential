import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { MenoresDeMiHogar } from '../aplicacion/menores-del-hogar';
import type { ResultadoDeMenor } from '../aplicacion/menores-del-hogar';
import {
  BajaDeMenorDto,
  CodigoDeTraspasoDto,
  EdicionDeMenorDto,
  MenorDelHogarDto,
  MenorDto,
  MenorRegistradoDto,
} from './dtos-menores';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
  throw new ForbiddenException(r.error.detalle);
};

const exigir = (r: ResultadoDeMenor): Extract<ResultadoDeMenor, { hecho: true }> => {
  if (r.hecho) return r;
  if (r.estado === 400) throw new BadRequestException(r.explicacion);
  if (r.estado === 403) throw new ForbiddenException(r.explicacion);
  if (r.estado === 404) throw new NotFoundException(r.explicacion);
  throw new ConflictException(r.explicacion);
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * MIS MENORES · «MI FAMILIA» DEL RESIDENTE · RONDA 15-W (D-W2, D4, ADR-038)
 *
 * Personas de la vivienda SIN cuenta, que gestiona cualquier adulto con cuenta
 * de ella; el código de traspaso, sólo el titular. Ámbito por `ResolverMiAmbito`
 * y `exigirAlcance`; todo `:residenteId` se filtra en el SQL por la vivienda
 * del ámbito y sin cuenta, así que lo ajeno es 404. 20 por minuto (§7).
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residente')
@ApiBearerAuth()
@Roles('residente')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('copropiedades/:id/mi/menores')
export class MisMenoresController {
  constructor(
    @Inject(MenoresDeMiHogar) private readonly menores: MenoresDeMiHogar,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Los menores de mi vivienda: edad, documento enmascarado y plaza' })
  @ApiOkResponse({ type: [MenorDelHogarDto] })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MenorDelHogarDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores');
    return desenvolver(await this.menores.listar(destino, id)).map((m) => ({ ...m }));
  }

  @Post()
  @ApiOperation({ summary: 'Registra un menor en una plaza libre de mi vivienda (D-W2)' })
  @ApiCreatedResponse({ type: MenorRegistradoDto })
  async registrar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MenorDto,
  ): Promise<MenorRegistradoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores');
    const r = exigir(desenvolver(await this.menores.registrar(destino, id, { ...dto })));
    return { residenteId: r.residenteId };
  }

  @Put(':residenteId')
  @ApiOperation({ summary: 'Edita nombre, parentesco y fecha de un menor de mi vivienda' })
  @ApiOkResponse({ type: MenorRegistradoDto })
  async editar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('residenteId', ParseUUIDPipe) residenteId: string,
    @Body() dto: EdicionDeMenorDto,
  ): Promise<MenorRegistradoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores');
    const r = exigir(desenvolver(await this.menores.editar(destino, id, residenteId, { ...dto })));
    return { residenteId: r.residenteId };
  }

  @Post(':residenteId/baja')
  @HttpCode(200)
  @ApiOperation({ summary: 'Da de baja a un menor con motivo: su plaza queda libre (D4)' })
  @ApiOkResponse({ type: MenorRegistradoDto })
  async baja(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('residenteId', ParseUUIDPipe) residenteId: string,
    @Body() dto: BajaDeMenorDto,
  ): Promise<MenorRegistradoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores');
    const r = exigir(
      desenvolver(await this.menores.darDeBaja(destino, id, residenteId, dto.motivo.trim())),
    );
    return { residenteId: r.residenteId };
  }

  @Post(':residenteId/codigo-de-traspaso')
  @HttpCode(200)
  @ApiOperation({ summary: 'El titular genera el código con el que un mayor de 18 crea su cuenta' })
  @ApiOkResponse({ type: CodigoDeTraspasoDto })
  async codigoDeTraspaso(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('residenteId', ParseUUIDPipe) residenteId: string,
  ): Promise<CodigoDeTraspasoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores');
    const r = exigir(desenvolver(await this.menores.codigoDeTraspaso(destino, id, residenteId)));
    return { codigo: r.codigo ?? '' };
  }
}
