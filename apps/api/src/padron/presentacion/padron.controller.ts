import { Body, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ErrorDominio, PlanDeGeneracion, Resultado } from '@ncr/domain-core';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_PADRON } from '../aplicacion/puertos';
import type { RepositorioPadron } from '../aplicacion/puertos';
import { LECTOR_DE_VOCABULARIO } from '../aplicacion/vocabulario';
import type { LectorDeVocabulario } from '../aplicacion/vocabulario';
import { GenerarViviendas } from '../aplicacion/generar-viviendas';
import { ExportarPadron } from '../aplicacion/exportar-padron';
import {
  DesactivarVehiculo,
  DesactivarVivienda,
  RegistrarPersona,
  RegistrarResidente,
  RegistrarVehiculo,
  RegistrarVivienda,
} from '../aplicacion/casos-de-uso';
import { CargarPadronDesdeArchivo, analizarCsv } from '../aplicacion/carga-padron';
import type { FilaPadron } from '../aplicacion/carga-padron';
import { ArchivoInvalido, filasDesdeXlsx } from '../infraestructura/xlsx';
import {
  CargarPadronDto,
  CargarPadronXlsxDto,
  ConfirmarGeneracionDto,
  DesactivarDto,
  PlanDeGeneracionDto,
  RegistrarPersonaDto,
  RegistrarResidenteDto,
  RegistrarVehiculoDto,
  RegistrarViviendaDto,
} from './dtos';
import {
  BajaDto,
  GeneracionAplicadaDto,
  IdCreadoDto,
  PersonaResueltaDto,
  ResultadoDeCargaDto,
  VistaPreviaDeGeneracionDto,
} from './respuestas';

/**
 * Del DTO plano al plan del dominio.
 *
 * El DTO es plano porque `ValidationPipe` valida formas planas; el dominio es
 * una unión discriminada porque un plan de apartamentos y uno de fincas no
 * tienen los mismos campos. La traducción es aquí, en presentación, y es el
 * único sitio donde los dos se tocan. **No decide nada**: los valores que
 * faltan van como `0` o `''` y `generarPlan` los rechaza con su mensaje, que es
 * el que el usuario debe leer (§2.7.3: el DTO valida forma, el dominio valida
 * verdad).
 */
const planDesdeDto = (dto: PlanDeGeneracionDto): PlanDeGeneracion => ({
  agrupaciones: dto.agrupaciones,
  estilo: dto.estilo ?? 'numeros',
  cantidad: dto.cantidad,
  ...(dto.porPiso === undefined ? {} : { porPiso: dto.porPiso }),
  ...(dto.reiniciarNumeracion === undefined
    ? {}
    : { reiniciarNumeracion: dto.reiniciarNumeracion }),
  excepciones: (dto.excepciones ?? []).map((e) => ({
    agrupacion: e.agrupacion,
    cantidad: e.cantidad,
  })),
});

/**
 * Traduce protocolo a casos de uso. **Cero reglas de negocio** (§2.2): lo único
 * que decide aquí es qué código HTTP corresponde a cada error tipado del
 * dominio, que es una decisión de transporte.
 */
@ApiTags('padron')
@ApiBearerAuth()
/**
 * **Bajo `copropiedades/:id`, y no en `padron` a secas** — D-71.
 *
 * Las escrituras del padrón colgaban de `/padron/…` y tomaban la copropiedad
 * del token. Para un superadministrador ese campo es nulo por diseño, así que
 * **ninguna escritura funcionaba**: `400 · La identidad no tiene copropiedad`.
 * Las lecturas ya se habían movido aquí en la 09-B por el barrido de
 * aislamiento; las escrituras se quedaron, y nadie las recorrió con ese rol.
 *
 * Ahora la copropiedad de destino viene de la RUTA —que es lo que el selector
 * de la consola pone— y `exigirAlcance` la valida contra el alcance real antes
 * de devolver el contexto con el que se opera.
 */
@Controller('copropiedades/:id/padron')
export class PadronController {
  constructor(
    @Inject(REPOSITORIO_PADRON) private readonly repo: RepositorioPadron,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(LECTOR_DE_VOCABULARIO) private readonly vocabulario: LectorDeVocabulario,
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
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: RegistrarVehiculoDto,
  ): Promise<IdCreadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/vehiculos');
    return this.desenvolver(await new RegistrarVehiculo(this.repo).ejecutar(destino, dto));
  }

  @Post('vehiculos/:vehiculoId/desactivacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Baja lógica del vehículo; el motivo es obligatorio (RN-19)' })
  @ApiOkResponse({ type: BajaDto })
  async desactivarVehiculo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('vehiculoId', ParseUUIDPipe) id: string,
    @Body() dto: DesactivarDto,
  ): Promise<BajaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/vehiculos');
    this.desenvolver(await new DesactivarVehiculo(this.repo).ejecutar(destino, id, dto.motivo));
    return { desactivado: true };
  }

  @Post('viviendas/:viviendaId/desactivacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Baja lógica de la vivienda; conserva su historial (RN-19, CA-02)' })
  @ApiOkResponse({ type: BajaDto })
  async desactivarVivienda(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('viviendaId', ParseUUIDPipe) id: string,
    @Body() dto: DesactivarDto,
  ): Promise<BajaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/viviendas');
    this.desenvolver(await new DesactivarVivienda(this.repo).ejecutar(destino, id, dto.motivo));
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
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: CargarPadronDto,
  ): Promise<ResultadoDeCargaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/carga');
    const filas = analizarCsv(dto.csv);
    return this.aplicarCarga(destino, filas);
  }

  @Post('carga/xlsx')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Carga transaccional desde XLSX validando el TIPO REAL del archivo (HU-03, D-20t)',
  })
  @ApiOkResponse({ type: ResultadoDeCargaDto })
  async cargarXlsx(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: CargarPadronXlsxDto,
  ): Promise<ResultadoDeCargaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/carga');
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
    return this.aplicarCarga(destino, filas);
  }

  private async aplicarCarga(
    ctx: ContextoTenant,
    filas: readonly FilaPadron[],
  ): Promise<ResultadoDeCargaDto> {
    const resultado = await new CargarPadronDesdeArchivo(this.repo, this.vocabulario).ejecutar(
      ctx,
      filas,
    );
    return {
      aceptadas: resultado.aceptadas,
      errores: resultado.errores.map((e) => ({ fila: e.numeroDeFila, motivo: e.motivo })),
      aplicada: resultado.aplicada,
      viviendasCreadas: resultado.viviendasCreadas,
      personasCreadas: resultado.personasCreadas,
      identificadoresRecortados: resultado.identificadoresRecortados,
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
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: RegistrarViviendaDto,
  ): Promise<IdCreadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/viviendas');
    return this.desenvolver(
      await new RegistrarVivienda(this.repo, this.vocabulario).ejecutar(destino, dto),
    );
  }

  /**
   * **Vista previa de la generación.** Es `POST` y no `GET` porque el plan es un
   * cuerpo con excepciones anidadas, no una cadena de consulta — y porque un
   * `GET` con ese cuerpo acabaría cacheado en algún proxy.
   *
   * No escribe nada. Lee para informar de las colisiones, y esa lectura puede
   * quedarse obsoleta antes de que el usuario confirme: la garantía es el
   * índice (ADR-04), no esta consulta.
   */
  @Post('viviendas/generacion/previsualizacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Qué se va a crear, antes de crearlo: extremos por grupo y total' })
  @ApiOkResponse({ type: VistaPreviaDeGeneracionDto })
  async previsualizarGeneracion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: PlanDeGeneracionDto,
  ): Promise<VistaPreviaDeGeneracionDto> {
    const destino = await this.aislamiento.exigirAlcance(
      ctx,
      copropiedadId,
      'padron/viviendas/generacion',
    );
    const vista = this.desenvolver(
      await new GenerarViviendas(this.repo).previsualizar(destino, planDesdeDto(dto)),
    );
    return {
      total: vista.total,
      grupos: vista.grupos.map((g) => ({
        agrupacion: g.agrupacion,
        cantidad: g.cantidad,
        primeras: [...g.primeras],
        ultimas: [...g.ultimas],
        porExcepcion: g.porExcepcion,
      })),
      colisiones: vista.colisiones.map((c) => ({
        agrupacion: c.agrupacion,
        identificador: c.identificador,
      })),
    };
  }

  /**
   * **La generación. Solo inserta.**
   *
   * No hay `UPDATE` ni `DELETE` en esta ruta, así que «regenerar sobre un padrón
   * con residentes» no existe como operación: si una sola de las viviendas del
   * plan ya está activa, no se crea ninguna y se nombran todas las que chocaron.
   * Volver a lanzar el mismo plan es un rechazo con la lista, no un duplicado —
   * por eso tampoco hace falta clave de idempotencia.
   */
  @Post('viviendas/generacion')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Crea el padrón entero en una sentencia; el índice decide (ADR-04)' })
  @ApiOkResponse({ type: GeneracionAplicadaDto })
  async generarViviendas(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: ConfirmarGeneracionDto,
  ): Promise<GeneracionAplicadaDto> {
    const destino = await this.aislamiento.exigirAlcance(
      ctx,
      copropiedadId,
      'padron/viviendas/generacion',
    );
    return this.desenvolver(
      await new GenerarViviendas(this.repo).confirmar(
        destino,
        planDesdeDto(dto),
        dto.totalEsperado,
      ),
    );
  }

  /**
   * El padrón en las columnas del archivo del administrador, para corregirlo en
   * Excel y volver a cargarlo. El círculo tiene que cerrar sin editar nada.
   */
  @Get('exportacion')
  @Roles('administrador', 'superadministrador')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="padron.csv"')
  @ApiOperation({ summary: 'Padrón en CSV, con las mismas columnas que acepta la carga' })
  @ApiOkResponse({ type: String })
  async exportar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<string> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/exportacion');
    const exportado = await new ExportarPadron(this.repo).ejecutar(destino);
    return exportado.csv;
  }

  @Post('personas')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Da de alta una persona por nombre y documento, o resuelve la que ya existe (D-72)',
  })
  @ApiOkResponse({ type: PersonaResueltaDto })
  async registrarPersona(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: RegistrarPersonaDto,
  ): Promise<PersonaResueltaDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/personas');
    return this.desenvolver(await new RegistrarPersona(this.repo).ejecutar(destino, dto));
  }

  @Post('residentes')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Vincula una persona a una vivienda como residente (HU-02)' })
  @ApiOkResponse({ type: IdCreadoDto })
  async registrarResidente(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: RegistrarResidenteDto,
  ): Promise<IdCreadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'padron/residentes');
    return this.desenvolver(await new RegistrarResidente(this.repo).ejecutar(destino, dto));
  }
}
