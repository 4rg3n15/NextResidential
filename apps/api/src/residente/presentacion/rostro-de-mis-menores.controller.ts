import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
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
import { RostroDeMisMenores } from '../aplicacion/rostro-de-mis-menores';
import { EstadoDeMiRostroDto, MiRostroConPoliticaDto, RostroDeMenorDto } from './dtos-rostro';
import { exigirRostro } from './mi-rostro.controller';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
  throw new ForbiddenException(r.error.detalle);
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ROSTRO DE MIS MENORES · RONDA 15-X (D3, ADR-039, Ley 1581 art. 7)
 *
 * El titular del hogar, como representante legal, registra, lee y retira el
 * rostro de un menor de 15 a 17 años de SU vivienda. Otro adulto: 403. Un
 * `:residenteId` ajeno —otra vivienda, otra copropiedad, un adulto con cuenta—:
 * 404, filtrado en el SQL. Mismos límites que «Mi rostro»: 10 por minuto por IP
 * y 5 capturas en 24 h por CUENTA, contadas en la base (429 con Retry-After).
 * Sin caché, y nunca la imagen.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residente')
@ApiBearerAuth()
@Roles('residente')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('copropiedades/:id/mi/menores/:residenteId/rostro')
export class RostroDeMisMenoresController {
  constructor(
    @Inject(RostroDeMisMenores) private readonly rostro: RostroDeMisMenores,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'El estado del rostro de un menor de mi hogar y la política del representante',
  })
  @ApiOkResponse({ type: MiRostroConPoliticaDto })
  async estado(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('residenteId', ParseUUIDPipe) residenteId: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<MiRostroConPoliticaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores/rostro');
    const r = desenvolver(await this.rostro.estado(destino, id, residenteId));
    const e = exigirRostro(r, respuesta);
    return { ...e, equipos: [...e.equipos], politica: { ...e.politica } };
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'El titular registra o renueva, como representante legal, el rostro de un menor',
  })
  @ApiCreatedResponse({ type: EstadoDeMiRostroDto })
  async registrar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('residenteId', ParseUUIDPipe) residenteId: string,
    @Body() dto: RostroDeMenorDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<EstadoDeMiRostroDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores/rostro');
    const r = desenvolver(
      await this.rostro.registrar(destino, id, residenteId, {
        contenidoBase64: dto.contenidoBase64,
        tipoMime: dto.tipoMime,
        medidas: { ...dto.medidas },
        versionPolitica: dto.versionPolitica,
        // El DTO ya exigió `true` en las dos (`@Equals(true)`).
        declaraRepresentacionLegal: true,
        menorInformadoYDeAcuerdo: true,
      }),
    );
    const e = exigirRostro(r, respuesta);
    return { ...e, equipos: [...e.equipos] };
  }

  @Post('retiro')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'El titular retira el rostro de un menor: revoca y suprime en el acto, en los equipos',
  })
  @ApiOkResponse({ type: EstadoDeMiRostroDto })
  async retirar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('residenteId', ParseUUIDPipe) residenteId: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<EstadoDeMiRostroDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'mi/menores/rostro');
    const e = exigirRostro(
      desenvolver(await this.rostro.retirar(destino, id, residenteId)),
      respuesta,
    );
    return { ...e, equipos: [...e.equipos] };
  }
}
