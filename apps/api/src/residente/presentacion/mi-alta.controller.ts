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
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { VerMiAlta, VincularMiVivienda } from '../aplicacion/alta';
import type { EntradaDeAlta, ResultadoDeAlta } from '../aplicacion/alta';
import { DeclararMisOcupantes, VerMisOcupantes } from '../aplicacion/ocupantes';
import type { MisOcupantes } from '../aplicacion/ocupantes';
import { AltaDeMiViviendaDto, DeclaracionDeOcupantesDto } from './dtos-hogar';
import { EstadoDeMiAltaDto, MisOcupantesDto, ResultadoDeAltaDto } from './respuestas-hogar';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
  throw new ForbiddenException(r.error.detalle);
};

const entradaDe = (dto: AltaDeMiViviendaDto): EntradaDeAlta => ({
  perfil: { ...dto.perfil, fechaNacimiento: dto.perfil.fechaNacimiento ?? null },
  identificador: dto.identificador,
  agrupacion: dto.agrupacion ?? null,
  codigo: dto.codigo ?? null,
});

/**
 * 200 con el motivo cuando la regla lo impide —el residente tiene que leer por
 * qué, igual que al crear una visita—, y 400 con los campos cuando es la forma.
 */
const aDto = (r: ResultadoDeAlta): ResultadoDeAltaDto => {
  if (r.vinculada) {
    return {
      vinculada: true,
      debeDeclararOcupantes: r.debeDeclararOcupantes,
      motivo: null,
      explicacion: null,
      campos: [],
    };
  }
  if ('campos' in r) {
    throw new BadRequestException({ mensaje: 'Revise los datos', campos: [...r.campos] });
  }
  return {
    vinculada: false,
    debeDeclararOcupantes: false,
    motivo: r.motivo,
    explicacion: r.explicacion,
    campos: [],
  };
};

const ocupantesDto = (o: MisOcupantes): MisOcupantesDto => ({
  declarados: o.declarados,
  declarada: o.declarada,
  plazas: o.plazas.map((p) => ({ ...p })),
  aviso: o.aviso,
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PRIMER INGRESO Y OCUPANTES DEL RESIDENTE · ETAPA 15-I (3.2, 3.3, D6)
 *
 * El alta es la única superficie del residente SIN ámbito de vivienda, porque
 * es la que lo crea: la vivienda se busca por su número y el vínculo exige
 * código si ya hay alguien dentro. Lleva su propio límite por dirección
 * (30/min, el mismo del acceso: detrás de la wifi de un edificio salen todos
 * por una IP) además del que importa, el de códigos equivocados POR CUENTA que
 * cuenta la bitácora (5 en 15 minutos, S-55).
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residente')
@ApiBearerAuth()
@Controller('copropiedades/:id/mi')
export class MiAltaController {
  constructor(
    @Inject(VerMiAlta) private readonly verAlta: VerMiAlta,
    @Inject(VincularMiVivienda) private readonly vincular: VincularMiVivienda,
    @Inject(VerMisOcupantes) private readonly verOcupantes: VerMisOcupantes,
    @Inject(DeclararMisOcupantes) private readonly declarar: DeclararMisOcupantes,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('alta')
  @Roles('residente')
  @ApiOperation({ summary: 'Qué le falta al residente para operar: vivienda y ocupantes (3.2)' })
  @ApiOkResponse({ type: EstadoDeMiAltaDto })
  async estado(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<EstadoDeMiAltaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/alta');
    const e = await this.verAlta.ejecutar(destino, copropiedadId);
    if (e === null) throw new NotFoundException('Copropiedad no encontrada');
    return { ...e, vocabulario: { ...e.vocabulario } };
  }

  @Post('alta')
  @HttpCode(200)
  @Roles('residente')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Primer ingreso: contacto, documento, vivienda y código (3.2)' })
  @ApiOkResponse({ type: ResultadoDeAltaDto })
  async alta(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AltaDeMiViviendaDto,
  ): Promise<ResultadoDeAltaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/alta');
    return aDto(
      await this.vincular.ejecutar(destino, copropiedadId, entradaDe(dto), { cambio: false }),
    );
  }

  @Post('vinculacion')
  @HttpCode(200)
  @Roles('residente')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cambio de vivienda desde el perfil: siempre con código (3.5)' })
  @ApiOkResponse({ type: ResultadoDeAltaDto })
  async cambioDeVivienda(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AltaDeMiViviendaDto,
  ): Promise<ResultadoDeAltaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/vinculacion');
    return aDto(
      await this.vincular.ejecutar(destino, copropiedadId, entradaDe(dto), { cambio: true }),
    );
  }

  @Get('ocupantes')
  @Roles('residente')
  @ApiOperation({ summary: 'Mis ocupantes y los códigos de las plazas libres (3.3)' })
  @ApiOkResponse({ type: MisOcupantesDto })
  async ocupantes(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<MisOcupantesDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/ocupantes');
    return ocupantesDto(desenvolver(await this.verOcupantes.ejecutar(destino, copropiedadId)));
  }

  /**
   * D6 · 403 para todo lo que no sea la PRIMERA declaración del PRIMER
   * residente: el número sólo lo cambia el superadministrador.
   */
  @Post('ocupantes')
  @HttpCode(200)
  @Roles('residente')
  @ApiOperation({ summary: 'Declaro cuántos ocupantes hay: una vez y definitivo (D6)' })
  @ApiOkResponse({ type: MisOcupantesDto })
  async declararOcupantes(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: DeclaracionDeOcupantesDto,
  ): Promise<MisOcupantesDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/ocupantes');
    const r = desenvolver(
      await this.declarar.ejecutar(destino, copropiedadId, {
        numero: dto.numero,
        confirmado: dto.confirmoQueEsDefinitivo,
      }),
    );
    if (r.declarada) return ocupantesDto(r.ocupantes);
    if (r.dePermiso) {
      throw new ForbiddenException(
        'El número de ocupantes ya está fijado: sólo el superadministrador lo cambia (D6)',
      );
    }
    throw new BadRequestException(
      r.motivo === 'SIN_CONFIRMACION'
        ? 'Confirme que el número es definitivo'
        : 'El número de ocupantes va de 1 a 20',
    );
  }
}
