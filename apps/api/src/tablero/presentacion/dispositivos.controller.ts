import { Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { OPERACIONES_DE_DISPOSITIVO } from '../aplicacion/operaciones-de-dispositivo';
import type {
  OperacionDeDispositivo,
  OperacionesDeDispositivo,
} from '../aplicacion/operaciones-de-dispositivo';

export class ResultadoDeOperacionDto {
  @ApiProperty({ type: Boolean }) encolada!: boolean;
  @ApiProperty({ type: String, enum: ['configuracion', 'sincronizacion', 'reinicio'] })
  operacion!: string;
  @ApiProperty({ type: String, enum: ['sincronizando'] }) estado!: string;
  @ApiProperty({ type: String }) detalle!: string;
}

export class PendientesDto {
  @ApiProperty({
    type: [String],
    description:
      'Identificadores de equipos con una orden sin ejecutar: se muestran «sincronizando».',
  })
  dispositivos!: string[];
}

/**
 * Acciones sobre equipos — HU-36.
 *
 * **Aquí no sale ninguna credencial.** Ni el secreto, ni enmascarado, ni la
 * referencia a la bóveda (RN-21). El inventario —host, puerto, modelo,
 * firmware— lo sirve `GET tablero/dispositivos`, que ya decide por rol qué
 * campos rellena; esta superficie solo ORDENA, y una orden no necesita conocer
 * la credencial con la que se ejecutará.
 */
@ApiTags('dispositivos')
@ApiBearerAuth()
@Controller('copropiedades/:id/dispositivos')
export class DispositivosController {
  constructor(
    @Inject(OPERACIONES_DE_DISPOSITIVO) private readonly operaciones: OperacionesDeDispositivo,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  private async ordenar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    operacion: OperacionDeDispositivo,
  ): Promise<ResultadoDeOperacionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, `dispositivos/${operacion}`);
    return this.operaciones.solicitar({
      copropiedadId,
      dispositivoId,
      operacion,
      solicitadaPor: ctx.usuarioId,
      solicitadaEn: new Date(),
    });
  }

  @Get('pendientes')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Equipos con una orden sin ejecutar (se muestran «sincronizando»)' })
  @ApiOkResponse({ type: PendientesDto })
  async pendientes(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<PendientesDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'dispositivos/pendientes');
    return { dispositivos: [...(await this.operaciones.pendientesDe(copropiedadId))] };
  }

  @Post(':dispositivoId/configuracion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Encola la reconfiguración del equipo, atribuida a quien la pide' })
  @ApiOkResponse({ type: ResultadoDeOperacionDto })
  async configurar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('dispositivoId', ParseUUIDPipe) dispositivoId: string,
  ): Promise<ResultadoDeOperacionDto> {
    return this.ordenar(ctx, copropiedadId, dispositivoId, 'configuracion');
  }

  @Post(':dispositivoId/sincronizacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Encola la sincronización de plantillas y reglas del equipo' })
  @ApiOkResponse({ type: ResultadoDeOperacionDto })
  async sincronizar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('dispositivoId', ParseUUIDPipe) dispositivoId: string,
  ): Promise<ResultadoDeOperacionDto> {
    return this.ordenar(ctx, copropiedadId, dispositivoId, 'sincronizacion');
  }

  @Post(':dispositivoId/reinicio')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Encola el reinicio del equipo; queda auditado quién lo ordenó' })
  @ApiOkResponse({ type: ResultadoDeOperacionDto })
  async reiniciar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('dispositivoId', ParseUUIDPipe) dispositivoId: string,
  ): Promise<ResultadoDeOperacionDto> {
    return this.ordenar(ctx, copropiedadId, dispositivoId, 'reinicio');
  }
}
