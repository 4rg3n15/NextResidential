import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import {
  CuentasDeResidentesDelSuperadmin,
  OcupantesDelSuperadmin,
} from '../aplicacion/supervision-de-residentes';
import { AltaDeCuentaDeResidenteDto, AnadirOcupantesDto, RetiroDeOcupanteDto } from './dtos-hogar';
import {
  CuentaDeResidenteCreadaDto,
  CuentaDeResidenteDto,
  PlazaDeOcupanteDto,
  PlazaRetiradaDto,
  VehiculoDeResidenteDto,
} from './respuestas-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SUPERVISIÓN DE RESIDENTES · SÓLO EL SUPERADMINISTRADOR (3.1, D5 a, D6)
 *
 * Alta de cuentas por usuario, la vista de vehículos registrados por residentes
 * y las plazas de ocupante de cada vivienda. Cada ruta pasa por `exigirAlcance`
 * antes de tocar nada, y entra sola en los barridos de aislamiento y de
 * escalamiento de privilegios, que se derivan de los decoradores.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residentes')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/residentes')
export class SupervisionDeResidentesController {
  constructor(
    @Inject(CuentasDeResidentesDelSuperadmin)
    private readonly cuentas: CuentasDeResidentesDelSuperadmin,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('cuentas')
  @ApiOperation({ summary: 'Cuentas de residentes y su vivienda (sin correo)' })
  @ApiOkResponse({ type: [CuentaDeResidenteDto] })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CuentaDeResidenteDto[]> {
    await this.aislamiento.exigirAlcance(ctx, id, 'residentes/cuentas');
    return (await this.cuentas.listar(id)).map((c) => ({ ...c }));
  }

  @Post('cuentas')
  @ApiOperation({ summary: 'Alta de un residente con usuario y contraseña inicial (3.1)' })
  @ApiOkResponse({ type: CuentaDeResidenteCreadaDto })
  async alta(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AltaDeCuentaDeResidenteDto,
  ): Promise<CuentaDeResidenteCreadaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'residentes/cuentas');
    const r = await this.cuentas.alta(destino, id, {
      usuario: dto.usuario,
      contrasenaInicial: dto.contrasenaInicial,
      nombre: dto.nombre,
      telefono: dto.telefono ?? null,
    });
    if (r.ok) return { usuarioId: r.usuarioId };
    if (r.rechazo.motivo === 'DUPLICADO') {
      throw new ConflictException('Ese usuario ya existe en la copropiedad');
    }
    if (r.rechazo.motivo === 'FORMATO') throw new BadRequestException(r.rechazo.detalle);
    throw new ConflictException('El proveedor de identidad no aceptó la cuenta');
  }

  @Get('vehiculos')
  @ApiOperation({ summary: 'Vehículos registrados por residentes, con fecha y vivienda (D5 a)' })
  @ApiOkResponse({ type: [VehiculoDeResidenteDto] })
  async vehiculos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehiculoDeResidenteDto[]> {
    await this.aislamiento.exigirAlcance(ctx, id, 'residentes/vehiculos');
    return (await this.cuentas.vehiculosDeResidentes(id)).map((v) => ({
      ...v,
      ocupantes: [...v.ocupantes],
    }));
  }
}

@ApiTags('residentes')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/viviendas/:viviendaId/ocupantes')
export class OcupantesDeViviendaController {
  constructor(
    @Inject(OcupantesDelSuperadmin) private readonly ocupantes: OcupantesDelSuperadmin,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Plazas de ocupante de una vivienda, con los códigos libres (D6)' })
  @ApiOkResponse({ type: [PlazaDeOcupanteDto] })
  async ver(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('viviendaId', ParseUUIDPipe) viviendaId: string,
  ): Promise<PlazaDeOcupanteDto[]> {
    await this.aislamiento.exigirAlcance(ctx, id, 'viviendas/ocupantes');
    return (await this.ocupantes.ver(id, viviendaId)).map((p) => ({ ...p }));
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Añade ocupantes a petición del residente, con motivo (D6)' })
  @ApiOkResponse({ type: [PlazaDeOcupanteDto] })
  async anadir(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('viviendaId', ParseUUIDPipe) viviendaId: string,
    @Body() dto: AnadirOcupantesDto,
  ): Promise<PlazaDeOcupanteDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'viviendas/ocupantes');
    const plazas = await this.ocupantes.anadir(destino, id, viviendaId, dto.cantidad, dto.motivo);
    if (plazas === null) throw new NotFoundException('Vivienda no encontrada');
    return plazas.map((p) => ({ ...p }));
  }

  @Post(':plazaId/retiro')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Quita un ocupante; si la plaza estaba ocupada, da de baja el vínculo (D6)',
  })
  @ApiOkResponse({ type: PlazaRetiradaDto })
  async retirar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('viviendaId', ParseUUIDPipe) viviendaId: string,
    @Param('plazaId', ParseUUIDPipe) plazaId: string,
    @Body() dto: RetiroDeOcupanteDto,
  ): Promise<PlazaRetiradaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'viviendas/ocupantes');
    const hecho = await this.ocupantes.retirar(destino, id, viviendaId, plazaId, dto.motivo);
    if (!hecho) throw new NotFoundException('Plaza no encontrada');
    return { retirada: true };
  }
}
