import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { EditarYEliminarMiVehiculo } from '../aplicacion/vehiculos-propios-edicion';
import {
  EdicionDeVehiculoPropioDto,
  VehiculoEditadoDto,
  VehiculoEliminadoDto,
} from './dtos-vehiculos-propios';
import { LIMITE_DE_VEHICULOS } from './limites-del-hogar';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
  throw new ForbiddenException(r.error.detalle);
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EDITAR Y ELIMINAR MIS VEHÍCULOS · RONDA 15-W (D-W5, D5)
 *
 * Aparte de `mi-hogar.controller.ts` para no pasar de cinco rutas por clase
 * (§2.3). Las rutas y sus `operationId` son los que tenían allí: el contrato y
 * los clientes generados —el de Dart nombra sus métodos por ese identificador—
 * no cambian por mover dos manejadores de clase.
 *
 * El vehículo se busca en la vivienda del ámbito: el de un vecino responde 404.
 * La placa sólo cambia sin historial; eliminar borra sin historial y da de baja
 * con él (RN-19). Con el límite propio de los vehículos (D-W7).
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residente')
@ApiBearerAuth()
@Roles('residente')
@Throttle(LIMITE_DE_VEHICULOS)
@Controller('copropiedades/:id/mi/vehiculos')
export class MisVehiculosController {
  constructor(
    @Inject(EditarYEliminarMiVehiculo) private readonly edicion: EditarYEliminarMiVehiculo,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Put(':vehiculoId')
  @ApiOperation({
    operationId: 'MiHogarController_editarVehiculo',
    summary: 'Edito un vehículo propio; la placa sólo si no tiene historial (D5)',
  })
  @ApiOkResponse({ type: VehiculoEditadoDto })
  async editar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('vehiculoId', ParseUUIDPipe) vehiculoId: string,
    @Body() dto: EdicionDeVehiculoPropioDto,
  ): Promise<VehiculoEditadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/vehiculos');
    const r = desenvolver(
      await this.edicion.editar(destino, copropiedadId, vehiculoId, {
        color: dto.color,
        modelo: dto.modelo,
        ...(dto.marca === undefined ? {} : { marca: dto.marca }),
        ...(dto.ocupantes === undefined || dto.ocupantes === null
          ? {}
          : { ocupantes: dto.ocupantes }),
        ...(dto.placa === undefined || dto.placa === null ? {} : { placa: dto.placa }),
      }),
    );
    if (r.hecho) return { editado: true };
    if (r.estado === 404) throw new NotFoundException(r.explicacion);
    if (r.estado === 400) throw new BadRequestException(r.explicacion);
    throw new ConflictException(r.explicacion);
  }

  @Delete(':vehiculoId')
  @ApiOperation({
    operationId: 'MiHogarController_eliminarVehiculo',
    summary: 'Elimino un vehículo propio: borrado sin historial, baja lógica con él (D5)',
  })
  @ApiOkResponse({ type: VehiculoEliminadoDto })
  async eliminar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('vehiculoId', ParseUUIDPipe) vehiculoId: string,
  ): Promise<VehiculoEliminadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/vehiculos');
    const resultado = desenvolver(await this.edicion.eliminar(destino, copropiedadId, vehiculoId));
    if (resultado === null) throw new NotFoundException('Vehículo propio no encontrado');
    return { resultado };
  }
}
