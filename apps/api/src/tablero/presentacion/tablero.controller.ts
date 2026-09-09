import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import { ROLES_ADMINISTRATIVOS } from '../../autenticacion';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import {
  ConsultarAccesosPorHora,
  ConsultarDispositivos,
  ConsultarIndicadores,
  CopropiedadDesconocida,
} from '../aplicacion/casos-de-uso';
import {
  AccesosPorHoraDto,
  DispositivoDelTableroDto,
  EstadoDeDispositivosDto,
  IndicadoresDto,
} from './respuestas';

/**
 * Tablero operativo — pantalla W-02 del mockup, HU-38.
 *
 * **La copropiedad va en la ruta y además se comprueba contra el token**, igual
 * que en eventos y por el mismo motivo: el identificador de la ruta es lo que la
 * suite de aislamiento recorre para intentar la fuga. Estas tres rutas entran en
 * ese recorrido **solas**, por la enumeración del enrutador — no hay ninguna
 * lista que actualizar.
 *
 * Tres endpoints y no uno: una tarjeta caída no debe tumbar el tablero (hallazgo
 * de estados ausentes de la auditoría de mockups §4). Con una sola respuesta
 * agregada, un fallo en el histograma dejaría la pantalla entera en blanco.
 */
@ApiTags('tablero')
@ApiBearerAuth()
@Controller('copropiedades/:id/tablero')
export class TableroController {
  constructor(
    @Inject(ConsultarIndicadores) private readonly indicadores: ConsultarIndicadores,
    @Inject(ConsultarAccesosPorHora) private readonly accesos: ConsultarAccesosPorHora,
    @Inject(ConsultarDispositivos) private readonly dispositivos: ConsultarDispositivos,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('indicadores')
  @Roles('administrador', 'superadministrador', 'operador_central')
  @ApiOperation({ summary: 'Las cuatro tarjetas de indicadores del tablero (HU-38)' })
  @ApiOkResponse({ type: IndicadoresDto })
  async leerIndicadores(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<IndicadoresDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'tablero/indicadores');
    const r = await sinCopropiedad(() => this.indicadores.ejecutar(copropiedadId));
    return {
      padron: r.padron,
      visitantes: r.visitantes,
      alertas: r.alertas,
      ventana: {
        desde: r.ventana.desde.toISOString(),
        hasta: r.ventana.hasta.toISOString(),
        zonaHoraria: r.ventana.zonaHoraria,
      },
    };
  }

  @Get('accesos-por-hora')
  @Roles('administrador', 'superadministrador', 'operador_central')
  @ApiOperation({ summary: 'Histograma de accesos del día en la zona de la copropiedad' })
  @ApiOkResponse({ type: AccesosPorHoraDto })
  async leerAccesosPorHora(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<AccesosPorHoraDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'tablero/accesos-por-hora');
    const r = await sinCopropiedad(() => this.accesos.ejecutar(copropiedadId));
    return {
      franjas: r.franjas.map((f) => ({ ...f })),
      zonaHoraria: r.zonaHoraria,
      desde: r.desde.toISOString(),
      hasta: r.hasta.toISOString(),
    };
  }

  @Get('dispositivos')
  @Roles('administrador', 'superadministrador', 'operador_central')
  @ApiOperation({ summary: 'Estado en línea de los dispositivos por su latido (CA-26, RN-12)' })
  @ApiOkResponse({ type: EstadoDeDispositivosDto })
  async leerDispositivos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<EstadoDeDispositivosDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'tablero/dispositivos');
    const r = await sinCopropiedad(() => this.dispositivos.ejecutar(copropiedadId));

    // C-11 · el direccionamiento del equipo es dato de inventario, no secreto,
    // pero solo lo ven los roles administrativos. Se decide AQUÍ, en el borde,
    // y no en la consulta: el caso de uso no debe conocer el rol de quien mira.
    const administrativo = ROLES_ADMINISTRATIVOS.includes(ctx.rol);
    return {
      dispositivos: r.dispositivos.map(
        (d): DispositivoDelTableroDto => ({
          id: d.id,
          nombre: d.nombre,
          tipo: d.tipo,
          zonaId: d.zonaId,
          host: administrativo ? d.host : null,
          puerto: administrativo ? d.puerto : null,
          modelo: d.modelo,
          firmware: administrativo ? d.firmware : null,
          estado: d.estado,
          ultimoLatido: d.ultimoLatido === null ? null : d.ultimoLatido.toISOString(),
          ultimaSincronizacion:
            d.ultimaSincronizacion === null ? null : d.ultimaSincronizacion.toISOString(),
          segundosSinLatir: d.segundosSinLatir,
        }),
      ),
      saludables: r.saludables,
      degradados: r.degradados,
      caidos: r.caidos,
    };
  }
}

/**
 * La copropiedad ya pasó el filtro de alcance, así que si el repositorio no la
 * encuentra es que no existe. Se traduce a **404 y no a 500**: el mismo código
 * que devuelve una copropiedad ajena, para que las dos situaciones sean
 * indistinguibles desde fuera (§ Aislamiento).
 */
const sinCopropiedad = async <T>(operacion: () => Promise<T>): Promise<T> => {
  try {
    return await operacion();
  } catch (e: unknown) {
    if (e instanceof CopropiedadDesconocida) throw new NotFoundException('Recurso no encontrado');
    throw e;
  }
};
