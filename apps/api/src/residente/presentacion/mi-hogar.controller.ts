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
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { EditarMiPerfil, VerMiPerfil } from '../aplicacion/perfil';
import { DesactivarMiVehiculo, RegistrarMiVehiculo } from '../aplicacion/vehiculos-propios';
import { EstadoDelConsentimientoDeMiVisitante } from '../aplicacion/consentimiento-de-mi-visitante';
import { PerfilDto, VehiculoPropioDto } from './dtos-hogar';
import {
  EstadoDeConsentimientoDto,
  PerfilDelResidenteDto,
  ResultadoDePerfilDto,
  ResultadoDeVehiculoPropioDto,
  VehiculoDesactivadoDto,
} from './respuestas-hogar';

const desenvolver = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (r.ok) return r.valor;
  if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
  throw new ForbiddenException(r.error.detalle);
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PERFIL, VEHÍCULOS PROPIOS Y CONSENTIMIENTO DEL VISITANTE · ETAPA 15-I
 *
 * Todo con ámbito de vivienda resuelto desde la identidad (ResolverMiAmbito):
 * ninguna ruta admite nombrar la vivienda, y la que admite nombrar un vehículo
 * o un consentimiento sólo encuentra los de ESA vivienda.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residente')
@ApiBearerAuth()
@Controller('copropiedades/:id/mi')
export class MiHogarController {
  constructor(
    @Inject(VerMiPerfil) private readonly verPerfil: VerMiPerfil,
    @Inject(EditarMiPerfil) private readonly editarPerfil: EditarMiPerfil,
    @Inject(RegistrarMiVehiculo) private readonly registrarVehiculo: RegistrarMiVehiculo,
    @Inject(DesactivarMiVehiculo) private readonly desactivarVehiculo: DesactivarMiVehiculo,
    @Inject(EstadoDelConsentimientoDeMiVisitante)
    private readonly consentimiento: EstadoDelConsentimientoDeMiVisitante,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('perfil')
  @Roles('residente')
  @ApiOperation({ summary: 'Mi perfil, mi copropiedad y el teléfono de portería (3.5, D7)' })
  @ApiOkResponse({ type: PerfilDelResidenteDto })
  async perfil(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<PerfilDelResidenteDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/perfil');
    const p = await this.verPerfil.ejecutar(destino, copropiedadId);
    if (p === null) throw new NotFoundException('Complete primero su alta');
    return { ...p };
  }

  @Put('perfil')
  @Roles('residente')
  @ApiOperation({ summary: 'Edito mis datos personales y de contacto (3.5)' })
  @ApiOkResponse({ type: ResultadoDePerfilDto })
  async editar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: PerfilDto,
  ): Promise<ResultadoDePerfilDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/perfil');
    const r = await this.editarPerfil.ejecutar(destino, copropiedadId, {
      ...dto,
      fechaNacimiento: dto.fechaNacimiento ?? null,
    });
    if (r.guardado) return { guardado: true, perfil: { ...r.perfil }, motivo: null, campos: [] };
    if ('campos' in r) {
      throw new BadRequestException({ mensaje: 'Revise los datos', campos: [...r.campos] });
    }
    if (r.motivo === 'SIN_VINCULO') throw new NotFoundException('Complete primero su alta');
    return { guardado: false, perfil: null, motivo: r.motivo, campos: [] };
  }

  @Post('vehiculos')
  @HttpCode(200)
  @Roles('residente')
  @ApiOperation({
    summary: 'Registro un vehículo propio: activo al instante, dentro del tope (D5 a)',
  })
  @ApiOkResponse({ type: ResultadoDeVehiculoPropioDto })
  async vehiculo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: VehiculoPropioDto,
  ): Promise<ResultadoDeVehiculoPropioDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/vehiculos');
    const r = desenvolver(
      await this.registrarVehiculo.ejecutar(destino, copropiedadId, {
        placa: dto.placa,
        color: dto.color,
        modelo: dto.modelo,
        marca: dto.marca ?? null,
        tipo: dto.tipo,
        ocupantes: dto.ocupantes,
      }),
    );
    return r.registrado
      ? { registrado: true, id: r.id, motivo: null, explicacion: null }
      : { registrado: false, id: null, motivo: r.motivo, explicacion: r.explicacion };
  }

  @Post('vehiculos/:vehiculoId/desactivacion')
  @HttpCode(200)
  @Roles('residente')
  @ApiOperation({ summary: 'Doy de baja un vehículo propio de mi vivienda; libera el cupo' })
  @ApiOkResponse({ type: VehiculoDesactivadoDto })
  async desactivar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('vehiculoId', ParseUUIDPipe) vehiculoId: string,
  ): Promise<VehiculoDesactivadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/vehiculos');
    const hecho = desenvolver(
      await this.desactivarVehiculo.ejecutar(destino, copropiedadId, vehiculoId),
    );
    if (!hecho) throw new NotFoundException('Vehículo propio no encontrado');
    return { desactivado: true };
  }

  @Get('autorizaciones/:autorizacionId/consentimientos/:consentimientoId')
  @Roles('residente')
  @ApiOperation({ summary: '¿Respondió mi visitante? pendiente, aceptado o rechazado (RN-10)' })
  @ApiOkResponse({ type: EstadoDeConsentimientoDto })
  async estadoDelConsentimiento(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('autorizacionId', ParseUUIDPipe) autorizacionId: string,
    @Param('consentimientoId', ParseUUIDPipe) consentimientoId: string,
  ): Promise<EstadoDeConsentimientoDto> {
    const destino = await this.aislamiento.exigirAlcance(
      ctx,
      copropiedadId,
      'mi/autorizaciones/consentimiento',
    );
    return desenvolver(
      await this.consentimiento.ejecutar(destino, copropiedadId, autorizacionId, consentimientoId),
    );
  }
}
