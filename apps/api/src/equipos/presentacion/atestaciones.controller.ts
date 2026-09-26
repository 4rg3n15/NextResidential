import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { esFallo } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { RegistrarAtestacionDelInstalador } from '../aplicacion/atestacion-del-instalador';
import { REPOSITORIO_DE_EQUIPOS } from '../aplicacion/puertos';
import type { RepositorioDeEquipos } from '../aplicacion/puertos';
import { AtestacionDeEquipoDto, AtestacionDeEquipoEntradaDto } from './dtos-atestacion';
import { aAtestacionDto } from './equipos.controller';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-11 · LA ATESTACIÓN DEL INSTALADOR, POR SU PROPIA RUTA
 *
 * Sólo el superadministrador: atestar es firmar una prueba física, no una
 * tarea de la administración del conjunto. La base lo exige también (política
 * de inserción de la 0039), así que un rol mal declarado aquí choca con la RLS.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/equipos/:equipoId/atestacion')
export class AtestacionesController {
  constructor(
    @Inject(RegistrarAtestacionDelInstalador)
    private readonly registrar: RegistrarAtestacionDelInstalador,
    @Inject(REPOSITORIO_DE_EQUIPOS) private readonly equipos: RepositorioDeEquipos,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Post()
  @Roles('superadministrador')
  @ApiOperation({
    summary:
      'D-11 · registra la verificación FÍSICA de una cámara: una placa de su lista blanca y ' +
      'una desconocida, ninguna abrió. Vale para el firmware actual del equipo',
  })
  @ApiOkResponse({ type: AtestacionDeEquipoDto })
  async atestar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Body() dto: AtestacionDeEquipoEntradaDto,
  ): Promise<AtestacionDeEquipoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/atestacion');
    const r = await this.registrar.ejecutar(ctx, copropiedadId, {
      equipoId,
      placaEnListaBlanca: dto.placaEnListaBlanca,
      placaDesconocida: dto.placaDesconocida,
      evidencia: dto.evidencia,
    });
    if (esFallo(r)) {
      if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
      if (r.error.codigo === 'DATO_INVALIDO') throw new BadRequestException(r.error.detalle);
      throw new ForbiddenException(r.error.detalle);
    }
    const equipo = (await this.equipos.listar(ctx, copropiedadId)).find((e) => e.id === equipoId);
    return aAtestacionDto(r.valor, equipo?.firmware ?? null);
  }
}
