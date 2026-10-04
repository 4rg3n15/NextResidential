import {
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
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import { ErrorApiDto } from '../../comun/respuestas';
import { AvisosWebDelResidente } from '../aplicacion/avisos-web';
import {
  BajaDeSuscripcionDto,
  EstadoDeAvisosWebDto,
  SuscripcionAnuladaDto,
  SuscripcionRegistradaDto,
  SuscripcionWebPushDto,
} from './dtos-avisos-web';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  switch (r.error.codigo) {
    case 'ENTIDAD_NO_ENCONTRADA':
      throw new NotFoundException(r.error.detalle);
    case 'CONFLICTO_DE_CONCURRENCIA':
      throw new ConflictException(r.error.detalle);
    case 'DATO_INVALIDO':
      throw new UnprocessableEntityException(r.error.detalle);
    default:
      throw new ForbiddenException(r.error.detalle);
  }
};

/**
 * 15-R · B3 · los avisos al teléfono del residente, por Web Push (ADR-036).
 * Misma tabla que `/mi/notificaciones/aparatos`; ver `aplicacion/avisos-web.ts`.
 */
@ApiTags('residente')
@ApiBearerAuth()
@Controller('copropiedades/:id/mi/notificaciones/web-push')
export class MisAvisosWebController {
  constructor(
    @Inject(AvisosWebDelResidente) private readonly avisos: AvisosWebDelResidente,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Roles('residente')
  @ApiOperation({ summary: '¿Hay avisos al teléfono? Y la llave pública VAPID para suscribirse' })
  @ApiOkResponse({ type: EstadoDeAvisosWebDto })
  async estado(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<EstadoDeAvisosWebDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/web-push');
    return desenvolver(await this.avisos.estado(destino, copropiedadId));
  }

  @Post()
  @Roles('residente')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Suscribe este navegador a los avisos de mi vivienda (HU-34)' })
  @ApiCreatedResponse({ type: SuscripcionRegistradaDto })
  @ApiConflictResponse({ type: ErrorApiDto, description: 'El navegador es de otra cuenta' })
  async suscribir(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: SuscripcionWebPushDto,
  ): Promise<SuscripcionRegistradaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/web-push');
    return desenvolver(
      await this.avisos.suscribir(destino, copropiedadId, {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      }),
    );
  }

  @Post('baja')
  @HttpCode(200)
  @Roles('residente')
  @ApiOperation({ summary: 'Quita los avisos de este navegador' })
  @ApiOkResponse({ type: SuscripcionAnuladaDto })
  async anular(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: BajaDeSuscripcionDto,
  ): Promise<SuscripcionAnuladaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/web-push');
    return desenvolver(await this.avisos.anular(destino, copropiedadId, dto.endpoint));
  }
}
