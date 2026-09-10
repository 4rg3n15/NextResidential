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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { CONSULTA_AUTORIZACIONES } from '../aplicacion/puertos';
import type { RepositorioDeConsultaDeAutorizaciones } from '../aplicacion/puertos';
import {
  AgregarAcompanante,
  CrearAutorizacion,
  RevocarAutorizacion,
} from '../aplicacion/casos-de-uso';
import {
  AgregarAcompananteDto,
  CrearAutorizacionDto,
  RevocarAutorizacionDto,
} from './dtos-autorizacion';
import {
  AcompananteAgregadoDto,
  AutorizacionDto,
  IdAutorizacionDto,
  RevocacionDto,
} from './respuestas';

/**
 * Visitantes y autorizaciones — HU-07 a HU-10, HU-16, HU-17, CA-04 a CA-07.
 *
 * La copropiedad va en la ruta **y** se comprueba contra el token: es lo que
 * hace que la suite de aislamiento recorra estas rutas sin que nadie las
 * inscriba a mano.
 *
 * Ninguna decisión de negocio vive aquí. La vigencia que nace expirada, el
 * máximo de acompañantes y la revocación con motivo los deciden el agregado y
 * sus casos de uso; este archivo solo traduce error tipado a código HTTP.
 */
@ApiTags('autorizaciones')
@ApiBearerAuth()
@Controller('copropiedades/:id/autorizaciones')
export class AutorizacionesController {
  constructor(
    @Inject(CONSULTA_AUTORIZACIONES)
    private readonly consulta: RepositorioDeConsultaDeAutorizaciones,
    @Inject(CrearAutorizacion) private readonly crear: CrearAutorizacion,
    @Inject(RevocarAutorizacion) private readonly revocarCasoDeUso: RevocarAutorizacion,
    @Inject(AgregarAcompanante) private readonly agregar: AgregarAcompanante,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  private desenvolver<T>(r: Resultado<T, ErrorDominio>): T {
    if (r.ok) return r.valor;
    switch (r.error.codigo) {
      case 'CONFLICTO_DE_CONCURRENCIA':
      case 'INVARIANTE_VIOLADA':
        throw new ConflictException(r.error.detalle);
      case 'ENTIDAD_NO_ENCONTRADA':
        throw new NotFoundException(r.error.detalle);
      default:
        throw new BadRequestException(r.error.detalle);
    }
  }

  @Get()
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'Autorizaciones activas o historial completo (HU-16, HU-17)' })
  @ApiQuery({ name: 'ver', required: false, enum: ['activas', 'historial'] })
  @ApiOkResponse({ type: [AutorizacionDto] })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query('ver') ver?: string,
  ): Promise<AutorizacionDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    // Por defecto, ACTIVAS. El historial es explícito porque es la vista cara
    // y la que un operador rara vez quiere al abrir la pantalla.
    const solo = ver === 'historial' ? 'historial' : 'activas';
    const filas = await this.consulta.listar(copropiedadId, solo);
    return filas.map((f) => ({ ...f, acompanantes: [...f.acompanantes] })) as AutorizacionDto[];
  }

  @Post()
  @Roles('administrador', 'superadministrador', 'portero')
  @ApiOperation({ summary: 'Crea una autorización, única o recurrente (HU-07, HU-09, RN-22)' })
  @ApiOkResponse({ type: IdAutorizacionDto })
  async crearAutorizacion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: CrearAutorizacionDto,
  ): Promise<IdAutorizacionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    return this.desenvolver(await this.crear.ejecutar(ctx, dto));
  }

  @Post(':autorizacionId/revocacion')
  @Roles('administrador', 'superadministrador', 'portero')
  @ApiOperation({ summary: 'Revoca con motivo obligatorio; no borra (HU-10, RN-19)' })
  @ApiOkResponse({ type: RevocacionDto })
  async revocar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Body() dto: RevocarAutorizacionDto,
  ): Promise<RevocacionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    this.desenvolver(await this.revocarCasoDeUso.ejecutar(ctx, autorizacionId, dto.motivo));
    return { revocada: true };
  }

  @Post(':autorizacionId/acompanantes')
  @Roles('administrador', 'superadministrador', 'portero')
  @ApiOperation({ summary: 'Añade un acompañante por su propia identidad (HU-08, D-01)' })
  @ApiOkResponse({ type: AcompananteAgregadoDto })
  async agregarAcompanante(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Body() dto: AgregarAcompananteDto,
  ): Promise<AcompananteAgregadoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    this.desenvolver(await this.agregar.ejecutar(ctx, autorizacionId, dto));
    return { agregado: true };
  }
}
