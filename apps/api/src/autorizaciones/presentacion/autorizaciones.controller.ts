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
  Put,
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
  ModificarAutorizacion,
  RevocarAutorizacion,
} from '../aplicacion/casos-de-uso';
import {
  AdjuntarFotografiaDeVisitante,
  UrlDeFotografiaDeVisitante,
} from '../aplicacion/fotografia-de-visitante';
import {
  AgregarAcompananteDto,
  CrearAutorizacionDto,
  FotografiaDeVisitanteDto,
  ModificarAutorizacionDto,
  RevocarAutorizacionDto,
} from './dtos-autorizacion';
import {
  AcompananteAgregadoDto,
  AutorizacionDto,
  FotografiaAdjuntadaDto,
  IdAutorizacionDto,
  ModificacionDto,
  RevocacionDto,
  UrlDeFotografiaDto,
} from './respuestas';
import { MideKpi } from '../../observabilidad';

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
    @Inject(ModificarAutorizacion) private readonly modificar: ModificarAutorizacion,
    @Inject(AdjuntarFotografiaDeVisitante)
    private readonly adjuntarFoto: AdjuntarFotografiaDeVisitante,
    @Inject(UrlDeFotografiaDeVisitante) private readonly urlDeFoto: UrlDeFotografiaDeVisitante,
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
      case 'OPERACION_NO_PERMITIDA':
        throw new ConflictException(r.error.detalle);
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
  // RNF-01.2 · creada → disponible en el motor, < 5 s. El cronómetro para
  // cuando la respuesta sale, y cuando sale la autorización ya está confirmada.
  @MideKpi('KPI-09')
  @Roles('administrador', 'superadministrador', 'portero')
  @ApiOperation({ summary: 'Crea una autorización, única o recurrente (HU-07, HU-09, RN-22)' })
  @ApiOkResponse({ type: IdAutorizacionDto })
  async crearAutorizacion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: CrearAutorizacionDto,
  ): Promise<IdAutorizacionDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    return this.desenvolver(await this.crear.ejecutar(destino, dto));
  }

  @Put(':autorizacionId')
  @Roles('administrador', 'superadministrador', 'portero')
  @ApiOperation({ summary: 'Cambia fin de vigencia, placa u observaciones de una viva (O3)' })
  @ApiOkResponse({ type: ModificacionDto })
  async modificarAutorizacion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Body() dto: ModificarAutorizacionDto,
  ): Promise<ModificacionDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    this.desenvolver(await this.modificar.ejecutar(destino, autorizacionId, dto));
    return { modificada: true };
  }

  /**
   * La fotografía de IDENTIFICACIÓN del visitante (ADR-021). No es biométrica:
   * no genera plantilla ni viaja a ninguna terminal. Bucket privado y URL
   * firmada de vida corta (RN-21); el tipo se comprueba por los bytes, no por
   * lo que diga el cliente (§2.7.8).
   */
  @Post(':autorizacionId/fotografia')
  @Roles('administrador', 'superadministrador', 'portero')
  @ApiOperation({ summary: 'Adjunta la fotografía de identificación del visitante (O3, RN-21)' })
  @ApiOkResponse({ type: FotografiaAdjuntadaDto })
  async adjuntarFotografia(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Body() dto: FotografiaDeVisitanteDto,
  ): Promise<FotografiaAdjuntadaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    const r = this.desenvolver(await this.adjuntarFoto.ejecutar(destino, autorizacionId, dto));
    return { adjuntada: true, ...r };
  }

  @Get(':autorizacionId/fotografia')
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'URL firmada de vida corta de la fotografía del visitante (RN-21)' })
  @ApiOkResponse({ type: UrlDeFotografiaDto })
  async fotografia(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
  ): Promise<UrlDeFotografiaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    return this.desenvolver(await this.urlDeFoto.ejecutar(destino, autorizacionId));
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
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    this.desenvolver(await this.revocarCasoDeUso.ejecutar(destino, autorizacionId, dto.motivo));
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
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'autorizaciones');
    this.desenvolver(await this.agregar.ejecutar(destino, autorizacionId, dto));
    return { agregado: true };
  }
}
