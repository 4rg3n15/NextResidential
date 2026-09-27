import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import {
  CambiarVerificacionRemota,
  EnviarEventosAEsteMac,
} from '../aplicacion/configuracion-en-sitio';
import type { ResultadoDeCorreccionDeEquipo } from '../aplicacion/puertos';
import {
  MotivoDeConfiguracionDto,
  ResultadoDeConfiguracionDto,
  VerificacionRemotaDto,
} from './dtos-en-sitio';

/**
 * El equipo que no existe y el de otra copropiedad, 404 por igual (RN-15); una
 * precondición que falta —no es una cámara, no está declarada, el Mac no está
 * en su red— es 409 con la causa y el remedio en palabras.
 */
const desenvolver = (
  r: Resultado<ResultadoDeCorreccionDeEquipo, ErrorDominio>,
): ResultadoDeConfiguracionDto => {
  if (!r.ok) {
    if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
    throw new ConflictException(r.error.detalle);
  }
  const { aplicada, valorAnterior, valorNuevo, detalle } = r.valor;
  return { aplicada, valorAnterior, valorNuevo, detalle };
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS ACCIONES DE LA FICHA PARA EL DÍA DE ENTREGA · corrección de la 15-L
 *
 * Cambian la configuración de un equipo de acceso: sólo superadministración y
 * administración, con motivo, con el valor anterior y el nuevo en la
 * auditoría y con un límite estricto por identidad (§2.7.5).
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/equipos/:equipoId')
export class ConfiguracionEnSitioController {
  constructor(
    @Inject(EnviarEventosAEsteMac) private readonly enviar: EnviarEventosAEsteMac,
    @Inject(CambiarVerificacionRemota) private readonly verificacion: CambiarVerificacionRemota,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Post('enviar-eventos-a-este-mac')
  @HttpCode(200)
  @Roles('superadministrador', 'administrador')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'C2 · escribe en la cámara el servidor de alarmas con la IP actual del Mac, el puerto ' +
      'de la API y la ruta con su secreto, y lo lee de vuelta',
  })
  @ApiOkResponse({ type: ResultadoDeConfiguracionDto })
  async enviarEventos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Body() dto: MotivoDeConfiguracionDto,
  ): Promise<ResultadoDeConfiguracionDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/receptor');
    return desenvolver(await this.enviar.ejecutar(destino, copropiedadId, equipoId, dto.motivo));
  }

  @Put('verificacion-remota')
  @Roles('superadministrador', 'administrador')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'F2 · activa o desactiva la verificación remota de la terminal (AcsCfg) y la lee de ' +
      'vuelta. Desactivarla es el plan B sin código',
  })
  @ApiOkResponse({ type: ResultadoDeConfiguracionDto })
  async cambiarVerificacion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Body() dto: VerificacionRemotaDto,
  ): Promise<ResultadoDeConfiguracionDto> {
    const destino = await this.aislamiento.exigirAlcance(
      ctx,
      copropiedadId,
      'equipos/verificacion-remota',
    );
    return desenvolver(
      await this.verificacion.ejecutar(destino, copropiedadId, equipoId, dto.activar, dto.motivo),
    );
  }
}
