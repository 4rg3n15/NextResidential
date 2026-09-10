import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_PADRON } from '../aplicacion/puertos';
import type { FiltroDeViviendas, RepositorioPadron } from '../aplicacion/puertos';
import { ListarVehiculos, ListarViviendas } from '../aplicacion/casos-de-uso';
import { PaginaDeViviendasDto, VehiculoDto } from './respuestas';

/**
 * LECTURAS del padrón, bajo `copropiedades/:id`.
 *
 * **Por qué las lecturas van aquí y las escrituras siguen en `/padron`.** La
 * copropiedad en la ruta es lo que la suite de aislamiento recorre para
 * intentar la fuga: cada ruta con `:id` entra en el barrido automáticamente y
 * nadie tiene que acordarse de añadirla. Las escrituras derivan la copropiedad
 * del token —no admiten que el cliente la nombre— y por eso no llevan `:id`:
 * un identificador de tenant en el cuerpo es un campo con el que equivocarse.
 *
 * Las dos formas comprueban el alcance; lo que cambia es de dónde sale el
 * identificador, no si se verifica.
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
