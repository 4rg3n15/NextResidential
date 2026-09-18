import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import {
  VerMiFamilia,
  VerMiHistorial,
  VerMisAutorizaciones,
  VerMisVehiculos,
  VerMiVivienda,
} from '../aplicacion/casos-de-uso';
import { HistorialQueryDto } from './dtos';
import {
  MiAutorizacionDto,
  MiEventoDto,
  MiInicioDto,
  MiVehiculoDto,
  MiembroDeFamiliaDto,
} from './respuestas';

/**
 * Superficie del residente — las pantallas M-1, M-2, M-3, M-6 y M-8 del mockup.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE CONTROLADOR EXISTE, Y ES UN HALLAZGO
 *
 * Hasta aquí **el residente no tenía superficie**. `POST
 * /copropiedades/:id/autorizaciones` admite administrador, superadministrador y
 * portero; `GET …/eventos` admite esos tres y el operador de central. El padrón
 * entero cuelga de rutas de administración. Es decir: HU-07 a HU-09 y HU-33
 * —«el residente autoriza a su visitante», que es OE-02— no tenían endpoint
 * por el que ocurrir, y la ETAPA 11 no era «pintar ocho pantallas» sino
 * construir la mitad del servidor que falta.
 *
 * La alternativa era abrir las rutas de administración al rol `residente`. Es
 * la peor salida posible: `GET …/padron/viviendas` devuelve el conjunto
 * entero, así que abrirla habría dado a cada residente el padrón de sus
 * vecinos. El alcance del residente no es un filtro más sobre una consulta de
 * administración: es otro ámbito.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS EJES, Y LOS DOS SE COMPRUEBAN
 *
 * 1. La copropiedad va en la RUTA y `exigirAlcance` la compara con el token —el
 *    primer eje, el que la suite de aislamiento recorre entera—. Colgar esto de
 *    `/mi/...` sin copropiedad lo habría dejado fuera de ese recorrido: una
 *    exención en silencio justo en la superficie nueva.
 * 2. La vivienda **no existe como parámetro**. La resuelve `ResolverMiAmbito`
 *    desde la identidad y la comprueba el dominio (`ambitoDelResidente`). El
 *    segundo eje no se puede pedir porque no se puede nombrar.
 */
@ApiTags('residente')
@ApiBearerAuth()
@Controller('copropiedades/:id/mi')
export class MiController {
  constructor(
    @Inject(VerMiVivienda) private readonly verVivienda: VerMiVivienda,
    @Inject(VerMiFamilia) private readonly verFamilia: VerMiFamilia,
    @Inject(VerMisVehiculos) private readonly verVehiculos: VerMisVehiculos,
    @Inject(VerMisAutorizaciones) private readonly verAutorizaciones: VerMisAutorizaciones,
    @Inject(VerMiHistorial) private readonly verHistorial: VerMiHistorial,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  /**
   * Traduce el error tipado del dominio al protocolo. `ENTIDAD_NO_ENCONTRADA`
   * es 404 —incluido «esta identidad no tiene vivienda», que la app pinta como
   * el estado «sin vivienda asignada» del mockup M-1— y el cruce es 403 porque
   * ahí sí hay algo que decirle: su vínculo no es de este conjunto.
   */
  private desenvolver<T>(r: Resultado<T, ErrorDominio>): T {
    if (r.ok) return r.valor;
    if (r.error.codigo === 'ENTIDAD_NO_ENCONTRADA') throw new NotFoundException(r.error.detalle);
    throw new ForbiddenException(r.error.detalle);
  }

  @Get('vivienda')
  @Roles('residente')
  @ApiOperation({ summary: 'Mi vivienda, mi vínculo y si puedo autorizar (HU-33, M-1)' })
  @ApiOkResponse({ type: MiInicioDto })
  async vivienda(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<MiInicioDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/vivienda');
    const { vivienda, vinculo } = this.desenvolver(
      await this.verVivienda.ejecutar(destino, copropiedadId),
    );
    return {
      vivienda: {
        id: vivienda.id,
        identificador: vivienda.identificador,
        agrupacion: vivienda.agrupacion,
        etiquetaVivienda: vivienda.etiquetaVivienda,
        etiquetaAgrupacion: vivienda.etiquetaAgrupacion,
        direccion: vivienda.direccion,
        copropiedadNombre: vivienda.copropiedadNombre,
        estadoAdministrativo: vivienda.estadoAdministrativo,
        activa: vivienda.activa,
      },
      vinculo: {
        residenteId: vinculo.residenteId,
        esTitular: vinculo.esTitular,
        nivelAcceso: vinculo.nivelAcceso,
      },
      /**
       * RN-13 y RN-05 resueltas EN EL SERVIDOR. La app deshabilita el botón con
       * este booleano y no recompone la regla: si la recompusiera, el día que
       * RN-13 cambie habría dos versiones y una de las dos sería la falsa. El
       * servidor la aplica otra vez al crear, en 11-B; esto es para la interfaz.
       */
      puedeAutorizar: vivienda.activa && vinculo.esTitular,
    };
  }

  @Get('familia')
  @Roles('residente')
  @ApiOperation({ summary: 'Los residentes de mi vivienda (HU-02 lectura, M-2)' })
  @ApiOkResponse({ type: [MiembroDeFamiliaDto] })
  async familia(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<MiembroDeFamiliaDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/familia');
    return [...this.desenvolver(await this.verFamilia.ejecutar(destino, copropiedadId))];
  }

  @Get('vehiculos')
  @Roles('residente')
  @ApiOperation({ summary: 'Los vehículos de mi vivienda (HU-05, HU-06 lectura, M-3)' })
  @ApiOkResponse({ type: [MiVehiculoDto] })
  async vehiculos(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<MiVehiculoDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/vehiculos');
    return [...this.desenvolver(await this.verVehiculos.ejecutar(destino, copropiedadId))];
  }

  @Get('autorizaciones')
  @Roles('residente')
  @ApiOperation({ summary: 'Las autorizaciones de mi vivienda (HU-07 lectura, M-1)' })
  @ApiOkResponse({ type: [MiAutorizacionDto] })
  async autorizaciones(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<MiAutorizacionDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/autorizaciones');
    return [...this.desenvolver(await this.verAutorizaciones.ejecutar(destino, copropiedadId))];
  }

  @Get('historial')
  @Roles('residente')
  @ApiOperation({ summary: 'El historial de mi vivienda, con los filtros del mockup (HU-33, M-6)' })
  @ApiOkResponse({ type: [MiEventoDto] })
  async historial(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query() consulta: HistorialQueryDto,
  ): Promise<MiEventoDto[]> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'mi/historial');
    return [
      ...this.desenvolver(
        await this.verHistorial.ejecutar(destino, copropiedadId, {
          periodo: consulta.periodo ?? 'mes',
          limite: consulta.limite ?? 50,
        }),
      ),
    ];
  }
}
