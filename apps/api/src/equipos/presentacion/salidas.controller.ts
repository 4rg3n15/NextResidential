import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { ErrorApiDto } from '../../comun/respuestas';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { ALCANCE_DE_EQUIPOS } from './alcance-de-equipos';
import type { AlcanceDeEquipos } from './alcance-de-equipos';
import { SalidasDelEquipo } from '../aplicacion/salidas-del-equipo';
import { PuntosDeOperacion } from '../aplicacion/puntos-de-operacion';
import {
  NombreDePuntoDto,
  PuntoDeAccesoDto,
  PuntosDeAccesoDto,
  SalidasDelEquipoDto,
  aPuntoDto,
  aSalidasDto,
} from './dtos-salidas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · LAS SALIDAS DEL VIDEOPORTERO
 *
 *  · `GET  …/salidas`            el árbol que el equipo declara hoy + lo persistido;
 *  · `POST …/salidas/descubrir`  lo persiste en `puntos_de_acceso`;
 *  · `PATCH …/salidas/:puntoId`  el nombre que verá la guardia;
 *  · `GET  …/puntos`             lo que la guardia y la portería pueden abrir.
 *
 * Las tres primeras son de administración; la cuarta, de quien acciona puertas
 * (RN-08). Ninguna abre nada: la apertura es la orden manual de la guardia,
 * con su motivo. Todas cuelgan de `copropiedades/:id` y piden que el EQUIPO
 * sea de esa copropiedad (404 si no): la suite de aislamiento las recorre.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/equipos/:equipoId')
export class SalidasController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(ALCANCE_DE_EQUIPOS) private readonly equiposDeLaRuta: AlcanceDeEquipos,
    @Inject(SalidasDelEquipo) private readonly salidas: SalidasDelEquipo,
    @Inject(PuntosDeOperacion) private readonly operacion: PuntosDeOperacion,
  ) {}

  private async exigir(ctx: ContextoTenant, copropiedadId: string, equipoId: string) {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/salidas');
    await this.equiposDeLaRuta.exigir(ctx, copropiedadId, equipoId, 'equipos/salidas');
  }

  private static desenvolver<T>(r: Resultado<T, ErrorDominio>): T {
    if (r.ok) return r.valor;
    const { codigo, detalle } = r.error;
    if (codigo === 'OPERACION_NO_PERMITIDA') throw new ForbiddenException(detalle);
    if (codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(detalle);
    throw new BadRequestException(detalle);
  }

  @Get('salidas')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Las salidas que el videoportero declara y las persistidas' })
  @ApiOkResponse({ type: SalidasDelEquipoDto })
  @ApiForbiddenResponse({ type: ErrorApiDto })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async consultar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
  ): Promise<SalidasDelEquipoDto> {
    await this.exigir(ctx, copropiedadId, equipoId);
    return aSalidasDto(
      SalidasController.desenvolver(await this.salidas.consultar(ctx, copropiedadId, equipoId)),
    );
  }

  @Post('salidas/descubrir')
  @HttpCode(200)
  @Roles('superadministrador', 'administrador')
  @ApiOperation({
    summary: 'Lee las salidas del videoportero y las persiste como puntos de acceso',
  })
  @ApiOkResponse({ type: SalidasDelEquipoDto })
  @ApiForbiddenResponse({ type: ErrorApiDto })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async descubrir(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
  ): Promise<SalidasDelEquipoDto> {
    await this.exigir(ctx, copropiedadId, equipoId);
    return aSalidasDto(
      SalidasController.desenvolver(await this.salidas.descubrir(ctx, copropiedadId, equipoId)),
    );
  }

  @Patch('salidas/:puntoId')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Cambia el nombre de un punto de acceso' })
  @ApiOkResponse({ type: PuntoDeAccesoDto })
  @ApiForbiddenResponse({ type: ErrorApiDto })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async renombrar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Param('puntoId', ParseUUIDPipe) puntoId: string,
    @Body() dto: NombreDePuntoDto,
  ): Promise<PuntoDeAccesoDto> {
    await this.exigir(ctx, copropiedadId, equipoId);
    return aPuntoDto(
      SalidasController.desenvolver(
        await this.salidas.renombrar(ctx, copropiedadId, equipoId, puntoId, dto.nombre),
      ),
    );
  }

  @Get('puntos')
  @Roles('portero', 'operador_central', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Los puntos de acceso que se pueden abrir en este equipo' })
  @ApiOkResponse({ type: PuntosDeAccesoDto })
  @ApiForbiddenResponse({ type: ErrorApiDto })
  @ApiNotFoundResponse({ type: ErrorApiDto })
  async puntos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
  ): Promise<PuntosDeAccesoDto> {
    await this.exigir(ctx, copropiedadId, equipoId);
    const puntos = SalidasController.desenvolver(
      await this.operacion.listar(ctx, copropiedadId, equipoId),
    );
    return { puntos: puntos.map(aPuntoDto) };
  }
}
