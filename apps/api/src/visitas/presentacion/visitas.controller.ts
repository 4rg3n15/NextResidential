import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { MideKpi } from '../../observabilidad';
import { GenerarVisita } from '../aplicacion/generar-visita';
import { RechazarVisita } from '../aplicacion/rechazar-visita';
import {
  FotoDeVisitaEnEquipos,
  ListarVisitas,
  ViviendasParaVisitas,
} from '../aplicacion/consultar-visitas';
import { TEXTO_DE_LA_CASILLA, VERSION_DE_LA_CASILLA } from '../aplicacion/rostro-de-visita';
import {
  ConsultaDeVisitasDto,
  FotoEnEquipoDto,
  GenerarVisitaDto,
  ListaDeVisitasDto,
  RechazoDeVisitaDto,
  TextoDeLaCasillaDto,
  VisitaGeneradaDto,
  VisitaRechazadaDto,
  ViviendaDeVisitaDto,
} from './dtos';
import { aFotoEnEquipo, aGenerada, aVisita } from './respuestas';

/** Los roles de la consola: todos generan (F1) y todos ven la lista. */
const CONSOLA = ['superadministrador', 'administrador', 'portero', 'operador_central'] as const;

export const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  switch (r.error.codigo) {
    case 'ENTIDAD_NO_ENCONTRADA':
      throw new NotFoundException(r.error.detalle);
    case 'DATO_INVALIDO':
      throw new UnprocessableEntityException(r.error.detalle);
    case 'OPERACION_NO_PERMITIDA':
      throw new ForbiddenException(r.error.detalle);
    case 'CONFLICTO_DE_CONCURRENCIA':
    case 'INVARIANTE_VIOLADA':
      throw new ConflictException(r.error.detalle);
    default:
      throw new BadRequestException(r.error.detalle);
  }
};

/**
 * F (15-L) · VISITANTES EN LA CONSOLA.
 *
 * Una lista y un formulario, iguales para todos los roles salvo en dos cosas
 * que decide el servidor y no la pantalla: portería ve SÓLO el día (F5), y
 * sólo portería y superadministración RECHAZAN (F2).
 */
@ApiTags('visitas')
@ApiBearerAuth()
@Controller('copropiedades/:id/visitas')
export class VisitasController {
  constructor(
    @Inject(GenerarVisita) private readonly generar: GenerarVisita,
    @Inject(RechazarVisita) private readonly rechazar: RechazarVisita,
    @Inject(ListarVisitas) private readonly listar: ListarVisitas,
    @Inject(FotoDeVisitaEnEquipos) private readonly enEquipos: FotoDeVisitaEnEquipos,
    @Inject(ViviendasParaVisitas) private readonly viviendasDe: ViviendasParaVisitas,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Roles(...CONSOLA)
  @ApiOperation({ summary: 'Visitas: las del día en portería; con filtros en administración' })
  @ApiOkResponse({ type: ListaDeVisitasDto })
  async lista(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query() q: ConsultaDeVisitasDto,
  ): Promise<ListaDeVisitasDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'visitas');
    const r = desenvolver(
      await this.listar.ejecutar(destino, {
        desde: q.desde === undefined ? null : new Date(q.desde),
        hasta: q.hasta === undefined ? null : new Date(q.hasta),
        viviendaId: q.viviendaId ?? null,
        estado: q.estado ?? null,
        texto: q.texto ?? null,
      }),
    );
    return {
      soloElDia: r.soloElDia,
      desde: r.desde?.toISOString() ?? null,
      hasta: r.hasta?.toISOString() ?? null,
      visitas: r.visitas.map(aVisita),
    };
  }

  @Post()
  @MideKpi('KPI-09')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles(...CONSOLA)
  @ApiOperation({ summary: 'Genera la autorización de un visitante con su foto (F1, F2, F3, F4)' })
  @ApiOkResponse({ type: VisitaGeneradaDto })
  async crear(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: GenerarVisitaDto,
  ): Promise<VisitaGeneradaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'visitas');
    const r = desenvolver(
      await this.generar.ejecutar(destino, {
        visitante: {
          nombre: dto.nombre,
          tipoDocumento: dto.tipoDocumento,
          documento: dto.documento,
        },
        viviendaId: dto.viviendaId,
        inicio: new Date(dto.inicio),
        duracionMinutos: dto.duracionMinutos,
        placa: dto.placa ?? null,
        observaciones: dto.observaciones ?? null,
        foto: dto.foto,
        casillaMarcada: dto.casillaMarcada,
      }),
    );
    return aGenerada(r);
  }

  @Get('viviendas')
  @Roles(...CONSOLA)
  @ApiOperation({ summary: 'Las viviendas activas, para elegir a cuál va la visita' })
  @ApiOkResponse({ type: [ViviendaDeVisitaDto] })
  async viviendas(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ViviendaDeVisitaDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'visitas');
    return [...desenvolver(await this.viviendasDe.ejecutar(destino))];
  }

  @Get('casilla')
  @Roles(...CONSOLA)
  @ApiOperation({ summary: 'El texto de la casilla de consentimiento y su versión' })
  @ApiOkResponse({ type: TextoDeLaCasillaDto })
  async casilla(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<TextoDeLaCasillaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'visitas');
    return { texto: TEXTO_DE_LA_CASILLA, version: VERSION_DE_LA_CASILLA };
  }

  @Get(':autorizacionId/equipos')
  @Roles(...CONSOLA)
  @ApiOperation({ summary: 'En qué equipos está la foto de la visita, equipo por equipo (F3)' })
  @ApiOkResponse({ type: [FotoEnEquipoDto] })
  async equipos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
  ): Promise<FotoEnEquipoDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'visitas');
    return desenvolver(await this.enEquipos.ejecutar(destino, autorizacionId)).map(aFotoEnEquipo);
  }

  @Post(':autorizacionId/rechazo')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('portero', 'superadministrador')
  @ApiOperation({ summary: 'Rechaza la visita: la anula y retira la foto de los equipos (F2)' })
  @ApiOkResponse({ type: VisitaRechazadaDto })
  async rechazo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Body() dto: RechazoDeVisitaDto,
  ): Promise<VisitaRechazadaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'visitas');
    return desenvolver(
      await this.rechazar.ejecutar(destino, { autorizacionId, motivo: dto.motivo }),
    );
  }
}
