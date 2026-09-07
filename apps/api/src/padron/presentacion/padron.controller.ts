import { Body, Controller, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion/dominio/claims';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_PADRON } from '../aplicacion/puertos';
import type { RepositorioPadron } from '../aplicacion/puertos';
import {
  DesactivarVehiculo,
  DesactivarVivienda,
  RegistrarVehiculo,
} from '../aplicacion/casos-de-uso';
import { CargarPadronDesdeArchivo, analizarCsv } from '../aplicacion/carga-padron';
import { CargarPadronDto, DesactivarDto, RegistrarVehiculoDto } from './dtos';

/**
 * Traduce protocolo a casos de uso. **Cero reglas de negocio** (§2.2): lo único
 * que decide aquí es qué código HTTP corresponde a cada error tipado del
 * dominio, que es una decisión de transporte.
 */
@ApiTags('padron')
@ApiBearerAuth()
@Controller('padron')
export class PadronController {
  constructor(
    @Inject(REPOSITORIO_PADRON) private readonly repo: RepositorioPadron,
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
      case 'DATO_INVALIDO':
      default:
        throw new BadRequestException(r.error.detalle);
    }
  }

  @Post('vehiculos')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Registra un vehículo; la placa única activa la garantiza la base' })
  async registrarVehiculo(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: RegistrarVehiculoDto,
  ): Promise<{ id: string }> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/vehiculos');
    return this.desenvolver(await new RegistrarVehiculo(this.repo).ejecutar(ctx, dto));
  }

  @Post('vehiculos/:id/desactivacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Baja lógica del vehículo; el motivo es obligatorio (RN-19)' })
  async desactivarVehiculo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DesactivarDto,
  ): Promise<{ desactivado: true }> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/vehiculos');
    this.desenvolver(await new DesactivarVehiculo(this.repo).ejecutar(ctx, id, dto.motivo));
    return { desactivado: true };
  }

  @Post('viviendas/:id/desactivacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Baja lógica de la vivienda; conserva su historial (RN-19, CA-02)' })
  async desactivarVivienda(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DesactivarDto,
  ): Promise<{ desactivada: true }> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/viviendas');
    this.desenvolver(await new DesactivarVivienda(this.repo).ejecutar(ctx, id, dto.motivo));
    return { desactivada: true };
  }

  @Post('carga')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Carga transaccional desde CSV con reporte de errores por fila (HU-03)',
  })
  async cargar(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: CargarPadronDto,
  ): Promise<{ aceptadas: number; errores: unknown[]; aplicada: boolean }> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/carga');
    const filas = analizarCsv(dto.csv);
    const resultado = await new CargarPadronDesdeArchivo(this.repo).ejecutar(ctx, filas);
    return {
      aceptadas: resultado.aceptadas,
      errores: [...resultado.errores],
      aplicada: resultado.aplicada,
    };
  }
}
