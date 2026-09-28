import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { VerMisNotificaciones } from '../aplicacion/mis-notificaciones';
import { MiNotificacionDto } from './respuestas';

/**
 * 15-L · LAS NOTIFICACIONES DEL RESIDENTE, DESDE LA API.
 *
 * Sin servicio de mensajería no hay avisos con la app cerrada: la app lee esta
 * lista mientras está abierta y cuenta en Inicio las que no ha visto. Lo que
 * lista sale del directorio del residente, acotado a SU vivienda.
 */
@ApiTags('residente')
@ApiBearerAuth()
@Controller('copropiedades/:id/mi')
export class MisNotificacionesController {
  constructor(
    @Inject(VerMisNotificaciones) private readonly ver: VerMisNotificaciones,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('notificaciones')
  @Roles('residente')
  @ApiOperation({
    summary: 'Mis notificaciones: visitas rechazadas con su motivo e ingresos de mis visitantes',
  })
  @ApiOkResponse({ type: [MiNotificacionDto] })
  async notificaciones(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<MiNotificacionDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/notificaciones');
    const r = await this.ver.ejecutar(destino, copropiedadId);
    if (r.ok) return [...r.valor];
    if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
    throw new ForbiddenException(r.error.detalle);
  }
}
