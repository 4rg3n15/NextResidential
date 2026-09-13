import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_PADRON } from '../aplicacion/puertos';
import type { FiltroDeViviendas, RepositorioPadron } from '../aplicacion/puertos';
import { BuscarPersonas, ListarVehiculos, ListarViviendas } from '../aplicacion/casos-de-uso';
import { PaginaDeViviendasDto, PersonaDto, VehiculoDto } from './respuestas';

/**
 * LECTURAS del padrón, bajo `copropiedades/:id`.
 *
 * **La copropiedad va en la ruta, en las lecturas y en las escrituras.** Es lo
 * que la suite de aislamiento recorre para intentar la fuga: cada ruta con
 * `:id` entra en el barrido automáticamente y nadie tiene que acordarse de
 * añadirla. Las escrituras vivían en `/padron` a secas y tomaban la copropiedad
 * del token, hasta que D-71 demostró que así el superadministrador —cuyo campo
 * es nulo por diseño— no podía escribir nada; ahora comparten prefijo con estas
 * lecturas y `exigirAlcance` valida el destino en los dos casos.
 */
@ApiTags('padron')
@ApiBearerAuth()
@Controller('copropiedades/:id/padron')
export class PadronDeCopropiedadController {
  constructor(
    @Inject(REPOSITORIO_PADRON) private readonly repo: RepositorioPadron,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('viviendas')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Directorio de viviendas con totales de activas e inactivas (HU-01, RN-13)',
  })
  @ApiQuery({ name: 'estado', required: false, enum: ['activo', 'inactivo'] })
  @ApiQuery({ name: 'busqueda', required: false, type: String })
  @ApiOkResponse({ type: PaginaDeViviendasDto })
  async viviendas(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query('estado') estado?: string,
    @Query('busqueda') busqueda?: string,
  ): Promise<PaginaDeViviendasDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/viviendas');
    // Un `estado` que no es ninguno de los dos se trata como «sin filtro» en
    // vez de como error: viene de un parámetro de URL que cualquiera puede
    // escribir a mano, y un 400 aquí no protege de nada.
    const filtro: FiltroDeViviendas = {
      estado: estado === 'activo' || estado === 'inactivo' ? estado : undefined,
      busqueda: typeof busqueda === 'string' ? busqueda.slice(0, 120) : undefined,
    };
    const r = await new ListarViviendas(this.repo).ejecutar(copropiedadId, filtro);
    if (!r.ok) throw new Error(r.error.detalle);
    return { totales: r.valor.totales, viviendas: [...r.valor.viviendas] };
  }

  @Get('personas')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Busca personas por nombre o documento para autorizar sin escribir un UUID (D-72)',
  })
  @ApiQuery({
    name: 'busqueda',
    required: true,
    type: String,
    description: 'Nombre parcial o documento; con menos de dos caracteres devuelve vacío.',
  })
  @ApiOkResponse({ type: [PersonaDto] })
  async personas(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query('busqueda') busqueda?: string,
  ): Promise<PersonaDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/personas');
    const r = await new BuscarPersonas(this.repo).ejecutar(copropiedadId, busqueda ?? '');
    if (!r.ok) throw new Error(r.error.detalle);
    return [...r.valor];
  }

  @Get('vehiculos')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Vehículos con su vivienda y su propietario (HU-04, HU-05)' })
  @ApiOkResponse({ type: [VehiculoDto] })
  async vehiculos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<VehiculoDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/vehiculos');
    const r = await new ListarVehiculos(this.repo).ejecutar(copropiedadId);
    if (!r.ok) throw new Error(r.error.detalle);
    return [...r.valor];
  }
}
