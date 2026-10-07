import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
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
import { MiRostro } from '../aplicacion/mi-rostro';
import type { ResultadoDeMiRostro } from '../aplicacion/mi-rostro';
import type { EstadoDeMiRostro } from '../aplicacion/estado-del-rostro';
import { EstadoDeMiRostroDto, MiRostroConPoliticaDto, MiRostroDto } from './dtos-rostro';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
  throw new ForbiddenException(r.error.detalle);
};

/** 429 con `Retry-After` (§2.7.5); 400 con los motivos de la foto, para guiar la siguiente. */
export const exigirRostro = (r: ResultadoDeMiRostro, respuesta: Response): EstadoDeMiRostro => {
  if (r.hecho) return r.estado;
  if (r.estado === 400) {
    throw new BadRequestException({ message: r.explicacion, motivos: r.motivos ?? [] });
  }
  if (r.estado === 404) throw new NotFoundException(r.explicacion);
  if (r.estado === 429) {
    respuesta.setHeader('Retry-After', String(r.reintentarEnS ?? 60));
    throw new HttpException(r.explicacion, HttpStatus.TOO_MANY_REQUESTS);
  }
  throw new ConflictException(r.explicacion);
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * MI ROSTRO · RONDA 15-X (D2, ADR-039, D-W3)
 *
 * El rostro propio del adulto con cuenta: opcional, renovable cada año y
 * retirable en el acto. Ámbito por `exigirAlcance` y `ResolverMiAmbito`: la
 * persona sale del vínculo de la cuenta, nunca del cuerpo. 10 por minuto por
 * IP; el tope de 5 capturas en 24 h por cuenta lo cuenta la base. Sin caché:
 * el estado cambia con cada envío y retiro.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residente')
@ApiBearerAuth()
@Roles('residente')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('copropiedades/:id/mi/rostro')
export class MiRostroController {
  constructor(
    @Inject(MiRostro) private readonly rostro: MiRostro,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'El estado de mi rostro y la política vigente; nunca la imagen' })
  @ApiOkResponse({ type: MiRostroConPoliticaDto })
  async estado(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MiRostroConPoliticaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/rostro');
    const e = desenvolver(await this.rostro.estado(destino, id));
    return { ...e, equipos: [...e.equipos], politica: { ...e.politica } };
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Registra o renueva mi rostro (opcional, con la política aceptada)' })
  @ApiCreatedResponse({ type: EstadoDeMiRostroDto })
  async registrar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MiRostroDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<EstadoDeMiRostroDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/rostro');
    const r = desenvolver(
      await this.rostro.registrar(destino, id, {
        contenidoBase64: dto.contenidoBase64,
        tipoMime: dto.tipoMime,
        medidas: { ...dto.medidas },
        versionPolitica: dto.versionPolitica,
      }),
    );
    const e = exigirRostro(r, respuesta);
    return { ...e, equipos: [...e.equipos] };
  }

  @Post('retiro')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Retira mi rostro: revoca y suprime en el acto, también en los equipos',
  })
  @ApiOkResponse({ type: EstadoDeMiRostroDto })
  async retirar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<EstadoDeMiRostroDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/rostro');
    const e = exigirRostro(desenvolver(await this.rostro.retirar(destino, id)), respuesta);
    return { ...e, equipos: [...e.equipos] };
  }
}
