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
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { explicacionDe } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { MideKpi } from '../../observabilidad';
import { MiVisitaDto, RepetirVisitaDto, confirmacionDePlaca, hastaDe } from '../../visitas';
import { GenerarMiVisita, MisUltimosVisitantes, VolverAAutorizar } from '../aplicacion/mis-visitas';
import type { ResultadoDeMiVisita } from '../aplicacion/mis-visitas';
import { MiVisitaGeneradaDto, VisitanteRecienteDto } from './respuestas';
import { RevocarMiVisita } from '../aplicacion/revocar-mi-visita';
import { RevocacionDeMiVisitaDto, VisitaRevocadaDto } from './dtos-revocacion';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
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
 * C9 (15-M) · la confirmación de la placa sale de lo que el residente ENVIÓ:
 * placa, nombre, inicio y duración. En «volver a autorizar» el cuerpo no trae
 * ni nombre ni placa, así que va nula ([SUPUESTO] S-132).
 */
const aRespuesta = (
  r: ResultadoDeMiVisita,
  confirmacion: string | null = null,
): MiVisitaGeneradaDto => {
  const vacia = {
    motivo: null,
    explicacion: null,
    motivosDeFoto: [],
    equipos: 0,
    sincronizadas: 0,
    fallidas: 0,
    avisoDeSincronizacion: null,
    confirmacionDePlaca: null,
  };
  if (r.creada) {
    const s = r.sincronizacion ?? null;
    return {
      ...vacia,
      creada: true,
      id: r.id,
      repetida: r.repetida,
      equipos: s?.terminales ?? 0,
      sincronizadas: s?.sincronizadas ?? 0,
      fallidas: s?.fallidas ?? 0,
      avisoDeSincronizacion: r.avisoDeSincronizacion ?? null,
      confirmacionDePlaca: confirmacion,
    };
  }
  if ('motivosDeFoto' in r) {
    return {
      ...vacia,
      creada: false,
      id: null,
      repetida: false,
      motivosDeFoto: [...r.motivosDeFoto],
    };
  }
  return {
    ...vacia,
    creada: false,
    id: null,
    repetida: false,
    motivo: r.motivo,
    explicacion: explicacionDe(r.motivo),
  };
};

/**
 * F (15-L) · las visitas del residente: el mismo formulario que la consola,
 * con la vivienda sacada de su vínculo. Un rechazo de negocio (lista negra,
 * vivienda inactiva…) o una foto que no sirve devuelven 200 con el motivo,
 * como la creación de siempre: la app tiene que poder decir por qué.
 */
@ApiTags('residente')
@ApiBearerAuth()
@Controller('copropiedades/:id/mi/visitas')
export class MisVisitasController {
  constructor(
    @Inject(GenerarMiVisita) private readonly generar: GenerarMiVisita,
    @Inject(VolverAAutorizar) private readonly volver: VolverAAutorizar,
    @Inject(MisUltimosVisitantes) private readonly ultimos: MisUltimosVisitantes,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(RevocarMiVisita) private readonly revocar: RevocarMiVisita,
  ) {}

  /** 15-W (D-W6, D6) · revoco una visita que autoricé; su rostro sale de los equipos. */
  @Post(':autorizacionId/revocacion')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('residente')
  @ApiOperation({ summary: 'Revoco una visita vigente de mi vivienda, con motivo (D-W6)' })
  @ApiOkResponse({ type: VisitaRevocadaDto })
  async revocarVisita(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Body() dto: RevocacionDeMiVisitaDto,
  ): Promise<VisitaRevocadaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/visitas');
    const r = desenvolver(
      await this.revocar.ejecutar(destino, copropiedadId, autorizacionId, dto.motivo),
    );
    return { revocada: true, ...r };
  }

  @Post()
  @MideKpi('KPI-09')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('residente')
  @ApiOperation({ summary: 'Autorizo a un visitante con su foto y la casilla (F1, F4)' })
  @ApiOkResponse({ type: MiVisitaGeneradaDto })
  async crear(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: MiVisitaDto,
  ): Promise<MiVisitaGeneradaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/visitas');
    return aRespuesta(
      desenvolver(
        await this.generar.ejecutar(destino, copropiedadId, {
          nombre: dto.nombre,
          documento: dto.documento,
          inicio: new Date(dto.inicio),
          duracionMinutos: dto.duracionMinutos,
          placa: dto.placa ?? null,
          observaciones: dto.observaciones ?? null,
          foto: dto.foto,
          casillaMarcada: dto.casillaMarcada,
          claveDeIdempotencia: dto.claveDeIdempotencia,
        }),
      ),
      confirmacionDePlaca({
        placa: dto.placa ?? null,
        visitante: dto.nombre,
        desde: new Date(dto.inicio),
        hasta: hastaDe(new Date(dto.inicio), dto.duracionMinutos),
      }),
    );
  }

  @Post(':autorizacionId/repeticion')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('residente')
  @ApiOperation({ summary: 'Vuelvo a autorizar a un visitante anterior con su foto (F6)' })
  @ApiOkResponse({ type: MiVisitaGeneradaDto })
  async repetir(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Body() dto: RepetirVisitaDto,
  ): Promise<MiVisitaGeneradaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/visitas');
    return aRespuesta(
      desenvolver(
        await this.volver.ejecutar(destino, copropiedadId, {
          autorizacionId,
          inicio: new Date(dto.inicio),
          duracionMinutos: dto.duracionMinutos,
          casillaMarcada: dto.casillaMarcada,
          claveDeIdempotencia: dto.claveDeIdempotencia,
        }),
      ),
    );
  }

  @Get('ultimas')
  @Roles('residente')
  @ApiOperation({ summary: 'Mis últimos visitantes, uno por persona (F6)' })
  @ApiOkResponse({ type: [VisitanteRecienteDto] })
  async ultimas(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<VisitanteRecienteDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/visitas');
    return desenvolver(await this.ultimos.ejecutar(destino, copropiedadId)).map((v) => ({
      autorizacionId: v.autorizacionId,
      visitante: v.visitante,
      documento: v.documento,
      ultimaVisita: v.ultimaVisita.toISOString(),
      placa: v.placa,
      tieneFoto: v.tieneFoto,
    }));
  }
}
