import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_DE_EQUIPOS, SIN_PROBAR, SONDA_DE_EQUIPO } from '../aplicacion/puertos';
import type {
  AltaDeEquipo,
  DatosDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
  SondaDeEquipo,
} from '../aplicacion/puertos';
import {
  AltaDeEquipoDto,
  BajaDeEquipoDto,
  EquipoDto,
  EquiposDto,
  ResultadoDeSondeoDto,
} from './dtos';

/**
 * Alta, edición y baja de equipos — A.2.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUIÉN PUEDE, DICHO ROL A ROL
 *
 * Superadministrador y administrador. **Enumerados**, no derivados de una
 * jerarquía implícita: «el superadministrador puede todo lo del administrador»
 * es una regla que nadie escribió y que un día deja de cumplirse sin que nada
 * falle. El portero y el operador de central no entran aquí ni para mirar: el
 * inventario operativo lo sirve `dispositivos_operativos`, que no expone host.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NI EL SECRETO NI EL HOST EN LOS ERRORES
 *
 * El 404 de un equipo de otra copropiedad no dice qué equipo era. El error de
 * conexión nombra host y puerto —que es lo que hay que revisar— y nunca la
 * credencial. Y no hay ninguna respuesta que devuelva el secreto: no existe el
 * campo (ver `dtos.ts`).
 */
@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/equipos')
export class EquiposController {
  constructor(
    @Inject(REPOSITORIO_DE_EQUIPOS) private readonly repo: RepositorioDeEquipos,
    @Inject(SONDA_DE_EQUIPO) private readonly sonda: SondaDeEquipo,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  private aDto(e: DatosDeEquipo): EquipoDto {
    return { ...e };
  }

  private altaDesdeDto(dto: AltaDeEquipoDto): AltaDeEquipo {
    return {
      nombre: dto.nombre,
      tipo: dto.tipo,
      host: dto.host,
      puerto: dto.puerto,
      protocolo: dto.protocolo,
      usuario: dto.usuario,
      ...(dto.secreto === undefined ? {} : { secreto: dto.secreto }),
      canalBarrera: dto.canalBarrera ?? null,
      numeroDePuerta: dto.numeroDePuerta ?? null,
      canalDeAudio: dto.canalDeAudio ?? null,
    };
  }

  /**
   * El sondeo necesita el secreto, y al editar puede no venir. Sin secreto no
   * se sondea: probar con una credencial que no tenemos produciría un
   * «rechazada» falso, y un rechazo falso invita a reintentar — que es
   * justamente lo que bloquea la cuenta en el equipo.
   */
  private async sondear(dto: AltaDeEquipoDto): Promise<ResultadoDeSondeo> {
    if (dto.probarConexion === false) return SIN_PROBAR;
    if (dto.secreto === undefined) {
      return {
        ...SIN_PROBAR,
        detalle:
          'Guardado sin comprobar: para probar la conexión hay que volver a escribir la clave ' +
          'del equipo, porque el sistema no la muestra ni la reenvía.',
      };
    }
    return this.sonda.probar({
      host: dto.host,
      puerto: dto.puerto,
      protocolo: dto.protocolo,
      usuario: dto.usuario,
      secreto: dto.secreto,
      tipo: dto.tipo,
    });
  }

  @Get()
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Equipos de la copropiedad, sin credenciales' })
  @ApiOkResponse({ type: EquiposDto })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<EquiposDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/listar');
    return { equipos: (await this.repo.listar(ctx, copropiedadId)).map((e) => this.aDto(e)) };
  }

  @Post('prueba-de-conexion')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({
    summary: 'Prueba la conexión DESDE EL SERVIDOR, sin guardar nada',
  })
  @ApiOkResponse({ type: ResultadoDeSondeoDto })
  async probar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AltaDeEquipoDto,
  ): Promise<ResultadoDeSondeoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/prueba');
    return { ...(await this.sondear({ ...dto, probarConexion: true })) };
  }

  @Post()
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Da de alta un equipo; el secreto se guarda cifrado' })
  @ApiOkResponse({ type: EquipoDto })
  async crear(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AltaDeEquipoDto,
  ): Promise<EquipoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/alta');
    const veredicto = await this.sondear(dto);
    const equipo = await this.repo.crear(ctx, copropiedadId, this.altaDesdeDto(dto), veredicto);
    return this.aDto(equipo);
  }

  @Put(':equipoId')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Edita un equipo. Sin «secreto» en el cuerpo, la clave no cambia' })
  @ApiOkResponse({ type: EquipoDto })
  async editar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Body() dto: AltaDeEquipoDto,
  ): Promise<EquipoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/edicion');
    const veredicto = await this.sondear(dto);
    const equipo = await this.repo.editar(
      ctx,
      copropiedadId,
      equipoId,
      this.altaDesdeDto(dto),
      veredicto,
    );
    if (equipo === null) throw new NotFoundException('No se encontró el equipo');
    return this.aDto(equipo);
  }

  @Post(':equipoId/baja')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Baja lógica con motivo. Nunca borrado físico (RN-19)' })
  @ApiOkResponse({ type: EquipoDto })
  async desactivar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Body() dto: BajaDeEquipoDto,
  ): Promise<EquipoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/baja');
    const equipo = await this.repo.desactivar(ctx, copropiedadId, equipoId, dto.motivo);
    if (equipo === null) throw new NotFoundException('No se encontró el equipo');
    return this.aDto(equipo);
  }

  @Post(':equipoId/reactivacion')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Vuelve a poner en servicio un equipo dado de baja' })
  @ApiOkResponse({ type: EquipoDto })
  async reactivar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
  ): Promise<EquipoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/reactivacion');
    const equipo = await this.repo.reactivar(ctx, copropiedadId, equipoId);
    if (equipo === null) throw new NotFoundException('No se encontró el equipo');
    return this.aDto(equipo);
  }
}
