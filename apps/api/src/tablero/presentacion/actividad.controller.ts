import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { ConsultarActividadPorVivienda } from '../aplicacion/actividad-por-vivienda';
import { CopropiedadDesconocida } from '../aplicacion/casos-de-uso';
import { ActividadPorViviendaDto } from './respuestas';

/**
 * 15-Z3 (D-Z3) · actividad por vivienda, para Portería y para el tablero del
 * superadministrador. Sólo lectura: recuentos, ningún dato de persona.
 *
 * Quién la ve: portero, administrador y superadministrador (D-Z3). El
 * residente no (403): es la actividad de TODAS las viviendas. El operador de
 * central tampoco, `[SUPUESTO]` S-15Z3-01: D-Z3 nombra al superadministrador y
 * al portero, y la central atiende colas, no ocupación; se abre si se pide.
 *
 * La copropiedad va en la ruta y se contrasta con el token (`exigirAlcance`):
 * la ruta entra sola en el recorrido de la suite de aislamiento. Una
 * copropiedad desconocida responde 404, el mismo código que una ajena.
 */
@ApiTags('tablero')
@ApiBearerAuth()
@Controller('copropiedades/:id/tablero')
export class ActividadController {
  constructor(
    @Inject(ConsultarActividadPorVivienda)
    private readonly actividad: ConsultarActividadPorVivienda,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('actividad-por-vivienda')
  @Roles('portero', 'administrador', 'superadministrador')
  @ApiOperation({
    summary:
      'Por vivienda: vehículos en visita activa y visitantes en este momento (D-Z3). Sólo recuentos.',
  })
  @ApiOkResponse({ type: ActividadPorViviendaDto })
  async leer(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ActividadPorViviendaDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'tablero/actividad-por-vivienda');
    try {
      const r = await this.actividad.ejecutar(copropiedadId);
      return {
        criterio: r.criterio,
        ahora: r.ahora.toISOString(),
        filas: r.filas.map((f) => ({ ...f })),
      };
    } catch (e: unknown) {
      if (e instanceof CopropiedadDesconocida) throw new NotFoundException('Recurso no encontrado');
      throw e;
    }
  }
}
