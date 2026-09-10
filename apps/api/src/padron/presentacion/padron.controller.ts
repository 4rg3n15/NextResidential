import { Body, Controller, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_PADRON } from '../aplicacion/puertos';
import type { RepositorioPadron } from '../aplicacion/puertos';
import {
  DesactivarVehiculo,
  DesactivarVivienda,
  RegistrarResidente,
  RegistrarVehiculo,
  RegistrarVivienda,
} from '../aplicacion/casos-de-uso';
import { CargarPadronDesdeArchivo, analizarCsv } from '../aplicacion/carga-padron';
import { ArchivoInvalido, filasDesdeXlsx } from '../infraestructura/xlsx';
import {
  CargarPadronDto,
  CargarPadronXlsxDto,
  DesactivarDto,
  RegistrarResidenteDto,
  RegistrarVehiculoDto,
  RegistrarViviendaDto,
} from './dtos';
import { BajaDto, IdCreadoDto, ResultadoDeCargaDto } from './respuestas';

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
  @ApiOkResponse({ type: IdCreadoDto })
  async registrarVehiculo(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: RegistrarVehiculoDto,
  ): Promise<IdCreadoDto> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/vehiculos');
    return this.desenvolver(await new RegistrarVehiculo(this.repo).ejecutar(ctx, dto));
  }

  @Post('vehiculos/:id/desactivacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Baja lógica del vehículo; el motivo es obligatorio (RN-19)' })
  @ApiOkResponse({ type: BajaDto })
  async desactivarVehiculo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DesactivarDto,
  ): Promise<BajaDto> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/vehiculos');
    this.desenvolver(await new DesactivarVehiculo(this.repo).ejecutar(ctx, id, dto.motivo));
    return { desactivado: true };
  }

  @Post('viviendas/:id/desactivacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Baja lógica de la vivienda; conserva su historial (RN-19, CA-02)' })
  @ApiOkResponse({ type: BajaDto })
  async desactivarVivienda(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DesactivarDto,
  ): Promise<BajaDto> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/viviendas');
    this.desenvolver(await new DesactivarVivienda(this.repo).ejecutar(ctx, id, dto.motivo));
    // `desactivado`, no `desactivada`: el mismo nombre que la baja de vehículo.
    // Dos campos distintos para la misma respuesta obligarían a la consola a
    // recordar cuál toca en cada pantalla, y ese es el tipo de detalle que se
    // recuerda mal.
    return { desactivado: true };
  }

  @Post('carga')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Carga transaccional desde CSV con reporte de errores por fila (HU-03)',
  })
  @ApiOkResponse({ type: ResultadoDeCargaDto })
  async cargar(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: CargarPadronDto,
  ): Promise<ResultadoDeCargaDto> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/carga');
    const filas = analizarCsv(dto.csv);
    return this.aplicarCarga(ctx, filas);
  }

  @Post('carga/xlsx')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Carga transaccional desde XLSX validando el TIPO REAL del archivo (HU-03, D-20t)',
  })
  @ApiOkResponse({ type: ResultadoDeCargaDto })
  async cargarXlsx(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: CargarPadronXlsxDto,
  ): Promise<ResultadoDeCargaDto> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/carga');
    let filas;
    try {
      // El lector comprueba la firma del archivo, no su extensión (§2.7.8), y
      // acota tamaño, entradas, razón de compresión y filas. Un archivo que no
      // es un XLSX se rechaza con 400 y el motivo, no con un 500 opaco.
      filas = filasDesdeXlsx(Buffer.from(dto.xlsxBase64, 'base64'));
    } catch (e) {
      if (e instanceof ArchivoInvalido) throw new BadRequestException(e.message);
      throw e;
    }
    return this.aplicarCarga(ctx, filas);
  }

  private async aplicarCarga(
    ctx: ContextoTenant,
    filas: readonly {
      readonly numeroDeFila: number;
      readonly viviendaId: string;
      readonly placa?: string;
      readonly personaId?: string;
      readonly esTitular?: boolean;
    }[],
  ): Promise<ResultadoDeCargaDto> {
    const resultado = await new CargarPadronDesdeArchivo(this.repo).ejecutar(ctx, filas);
    return {
      aceptadas: resultado.aceptadas,
      errores: resultado.errores.map((e) => ({ fila: e.numeroDeFila, motivo: e.motivo })),
      aplicada: resultado.aplicada,
      // Cuántas filas se leyeron de verdad. Sin este número, «0 aceptadas y 0
      // errores» no distingue «el archivo estaba vacío» de «no se entendió la
      // cabecera», y son dos problemas con soluciones distintas.
      filasLeidas: filas.length,
    };
  }

  @Post('viviendas')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Alta de vivienda; el identificador único activo lo garantiza la base' })
  @ApiOkResponse({ type: IdCreadoDto })
  async registrarVivienda(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: RegistrarViviendaDto,
  ): Promise<IdCreadoDto> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/viviendas');
    return this.desenvolver(await new RegistrarVivienda(this.repo).ejecutar(ctx, dto));
  }

  @Post('residentes')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Vincula una persona a una vivienda como residente (HU-02)' })
  @ApiOkResponse({ type: IdCreadoDto })
  async registrarResidente(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: RegistrarResidenteDto,
  ): Promise<IdCreadoDto> {
    await this.aislamiento.exigirAlcance(ctx, ctx.copropiedadId ?? '', 'padron/residentes');
    return this.desenvolver(await new RegistrarResidente(this.repo).ejecutar(ctx, dto));
  }
}
