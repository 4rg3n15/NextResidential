import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_DE_EQUIPOS } from '../aplicacion/puertos';
import type { DatosDeEquipo, RepositorioDeEquipos } from '../aplicacion/puertos';

export class NombreDeEquipoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) nombre!: string;
}

/** Sólo el identificador y el nombre: ni dirección, ni usuario, ni credencial. */
export const aNombreDeEquipo = (e: Pick<DatosDeEquipo, 'id' | 'nombre'>): NombreDeEquipoDto => ({
  id: e.id,
  nombre: e.nombre,
});

/**
 * DT-15L-02 (15-L) · LOS NOMBRES DE LOS EQUIPOS, PARA QUIEN OPERA.
 *
 * La lista completa de equipos (`GET …/equipos`) es de administración: lleva la
 * dirección de red, el usuario de servicio y el estado de la credencial. Pero
 * portería y central necesitan saber QUÉ equipo emitió cada evento de la línea
 * de tiempo; sin esto la consola les decía «Equipo sin nombre». Aquí sale
 * sólo el nombre, que es lo único que les hace falta.
 */
@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/nombres-de-equipos')
export class NombresDeEquiposController {
  constructor(
    @Inject(REPOSITORIO_DE_EQUIPOS) private readonly repo: RepositorioDeEquipos,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Roles('superadministrador', 'administrador', 'portero', 'operador_central')
  @ApiOperation({ summary: 'El nombre de cada equipo de la copropiedad, sin nada más' })
  @ApiOkResponse({ type: [NombreDeEquipoDto] })
  async nombres(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<NombreDeEquipoDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/nombres');
    return (await this.repo.listar(destino, copropiedadId)).map(aNombreDeEquipo);
  }
}
