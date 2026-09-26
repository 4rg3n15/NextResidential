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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { CONSULTA_LISTA_NEGRA } from '../aplicacion/puertos';
import type { ConsultaDeListaNegra } from '../aplicacion/puertos';
import { LevantarListaNegra, VetarEnListaNegra } from '../aplicacion/listas-negras';
import { VetoDto } from './dtos-autorizacion';
import { IdVetoDto, VetoLevantadoDto, VetoListadoDto } from './respuestas';

/**
 * HU-35 · RN-06 · RN-07 · la lista negra desde la consola (ETAPA 15-I).
 *
 * Los dos casos de uso existían desde la 05 sin nadie que los invocara, y los
 * escenarios de sitio L5 y T5 —lista negra con autorización vigente— exigen
 * vetar desde la consola. RN-07 separa quién VETA (también portero y operador,
 * que ven el incidente) de quién LEVANTA (sólo administración): la regla vive
 * en el caso de uso, y aquí además la declara el decorador de roles.
 *
 * El documento se resuelve a su persona en ESTA copropiedad; una placa se veta
 * normalizada. Nada de esto decide un acceso: el motor lee la lista como antes.
 */
@ApiTags('listas-negras')
@ApiBearerAuth()
@Controller('copropiedades/:id/listas-negras')
export class ListasNegrasController {
  constructor(
    @Inject(CONSULTA_LISTA_NEGRA) private readonly consulta: ConsultaDeListaNegra,
    @Inject(VetarEnListaNegra) private readonly vetar: VetarEnListaNegra,
    @Inject(LevantarListaNegra) private readonly levantar: LevantarListaNegra,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  private desenvolver<T>(r: Resultado<T, ErrorDominio>): T {
    if (r.ok) return r.valor;
    switch (r.error.codigo) {
      case 'CONFLICTO_DE_CONCURRENCIA':
        throw new ConflictException(r.error.detalle);
      case 'ENTIDAD_NO_ENCONTRADA':
        throw new NotFoundException(r.error.detalle);
      case 'OPERACION_NO_PERMITIDA':
        throw new ForbiddenException(r.error.detalle);
      default:
        throw new BadRequestException(r.error.detalle);
    }
  }

  @Get()
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Vetos activos de la copropiedad (HU-35)' })
  @ApiOkResponse({ type: [VetoListadoDto] })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<VetoListadoDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'listas-negras');
    return [...(await this.consulta.activas(copropiedadId))];
  }

  @Post()
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Veta una placa o una persona por su documento, con motivo (RN-06, RN-07)',
  })
  @ApiOkResponse({ type: IdVetoDto })
  async crear(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: VetoDto,
  ): Promise<IdVetoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'listas-negras');
    let personaId: string | null = null;
    if (dto.documento !== undefined && dto.documento !== null && dto.documento.trim() !== '') {
      personaId = await this.consulta.personaPorDocumento(copropiedadId, dto.documento);
      if (personaId === null) {
        throw new NotFoundException(
          'No hay una sola persona con ese documento en la copropiedad; vete por placa o revise el número',
        );
      }
    }
    return this.desenvolver(
      await this.vetar.ejecutar(destino, {
        personaId,
        placa: dto.placa ?? null,
        motivo: dto.motivo,
      }),
    );
  }

  @Post(':vetoId/levantamiento')
  @HttpCode(200)
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Levanta un veto: sólo la administración, con autor y momento (RN-07)' })
  @ApiOkResponse({ type: VetoLevantadoDto })
  async levantarVeto(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('vetoId', ParseUUIDPipe) vetoId: string,
  ): Promise<VetoLevantadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'listas-negras');
    this.desenvolver(await this.levantar.ejecutar(destino, vetoId));
    return { levantado: true };
  }
}
