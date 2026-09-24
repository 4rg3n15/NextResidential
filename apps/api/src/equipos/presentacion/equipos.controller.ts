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
import type { CapacidadesDeEquipo, FichaDelEquipo } from '@ncr/providers';
import { Aislamiento } from '../../multiempresa/aislamiento';
import {
  CORRECTOR_DE_EQUIPO,
  REPOSITORIO_DE_EQUIPOS,
  SIN_PROBAR,
  SONDA_DE_EQUIPO,
} from '../aplicacion/puertos';
import type {
  AltaDeEquipo,
  CorrectorDeEquipo,
  DatosDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
  SondaDeEquipo,
} from '../aplicacion/puertos';
import {
  AltaDeEquipoDto,
  BajaDeEquipoDto,
  CapacidadesDeEquipoDto,
  CorreccionDeEquipoDto,
  EquipoDto,
  EquiposDto,
  FichaDelEquipoDto,
  ResultadoDeCorreccionDto,
  ResultadoDeSondeoDto,
  EdicionDeEquipoDto,
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
/**
 * La ficha del proveedor a su DTO. Se copia campo a campo y no con un `spread`
 * porque lo que sale por HTTP tiene que ser una decisión explícita: un `spread`
 * publicaría mañana cualquier campo que alguien añada al tipo interno, y este
 * módulo es justo el que tiene un secreto que no puede salir.
 */
const aFicha = (ficha: FichaDelEquipo): FichaDelEquipoDto => ({
  modelo: ficha.modelo,
  firmware: ficha.firmware,
  serie: ficha.serie,
  horaDelEquipo: ficha.horaDelEquipo,
  desvioDeRelojSegundos: ficha.desvioDeRelojSegundos,
  sinComprobar: [...ficha.sinComprobar],
  hallazgos: ficha.hallazgos.map((h) => ({
    campo: h.campo,
    estado: h.estado,
    valorLeido: h.valorLeido,
    valorCorrecto: h.valorCorrecto,
    detalle: h.detalle,
    correccion: h.correccion,
  })),
});

/** Campo a campo, por la misma razón que la ficha: lo que sale es una decisión. */
const aCapacidades = (c: CapacidadesDeEquipo): CapacidadesDeEquipoDto => ({
  origen: c.origen,
  aperturaRemota: c.aperturaRemota,
  verificacionRemota: c.verificacionRemota,
  bibliotecaDeRostros: { ...c.bibliotecaDeRostros },
  gestionDePersonas: c.gestionDePersonas,
  audioBidireccional: { ...c.audioBidireccional },
  senalizacionDeLlamada: c.senalizacionDeLlamada,
  suscripcionDeEventos: c.suscripcionDeEventos,
  reconocimientoDePlacas: c.reconocimientoDePlacas,
  estadoDeBarrera: c.estadoDeBarrera,
});

@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/equipos')
export class EquiposController {
  constructor(
    @Inject(REPOSITORIO_DE_EQUIPOS) private readonly repo: RepositorioDeEquipos,
    @Inject(SONDA_DE_EQUIPO) private readonly sonda: SondaDeEquipo,
    @Inject(CORRECTOR_DE_EQUIPO) private readonly corrector: CorrectorDeEquipo,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  /**
   * Campo a campo y NUNCA con `spread` (§7.1): `DatosDeEquipo` lleva host,
   * puerto, protocolo y usuario porque la sonda y el corrector los necesitan
   * en el servidor; ninguno cruza al cliente.
   */
  private aDto(e: DatosDeEquipo): EquipoDto {
    return {
      id: e.id,
      nombre: e.nombre,
      tipo: e.tipo,
      modelo: e.modelo,
      firmware: e.firmware,
      canalBarrera: e.canalBarrera,
      numeroDePuerta: e.numeroDePuerta,
      canalDeAudio: e.canalDeAudio,
      fabricante: e.fabricante,
      modoDeTerminal: e.modoDeTerminal,
      canalDeAudioHabilitado: e.canalDeAudioHabilitado,
      capacidades: e.capacidades === null ? null : aCapacidades(e.capacidades),
      verificacion: e.verificacion,
      verificadoEn: e.verificadoEn,
      motivoNoVerificado: e.motivoNoVerificado,
      estado: e.estado,
    };
  }

  /**
   * O5 · la edición llega PARCIAL: lo ausente se conserva de lo guardado
   * (leer-modificar-escribir, §6.1). El cliente no conoce la dirección ni el
   * usuario, así que no puede reenviarlos; y «ausente» nunca significa «borra».
   */
  private altaDesdeEdicion(dto: EdicionDeEquipoDto, actual: DatosDeEquipo): AltaDeEquipoDto {
    const fusion = new AltaDeEquipoDto();
    Object.assign(fusion, {
      nombre: dto.nombre ?? actual.nombre,
      tipo: dto.tipo ?? actual.tipo,
      host: dto.host ?? actual.host,
      puerto: dto.puerto ?? actual.puerto,
      protocolo: dto.protocolo ?? actual.protocolo,
      usuario: dto.usuario ?? actual.usuario ?? '',
      ...(dto.secreto === undefined ? {} : { secreto: dto.secreto }),
      ...((dto.canalBarrera ?? actual.canalBarrera ?? undefined) === undefined
        ? {}
        : { canalBarrera: dto.canalBarrera ?? actual.canalBarrera }),
      ...((dto.numeroDePuerta ?? actual.numeroDePuerta ?? undefined) === undefined
        ? {}
        : { numeroDePuerta: dto.numeroDePuerta ?? actual.numeroDePuerta }),
      ...((dto.canalDeAudio ?? actual.canalDeAudio ?? undefined) === undefined
        ? {}
        : { canalDeAudio: dto.canalDeAudio ?? actual.canalDeAudio }),
      ...((dto.fabricante ?? actual.fabricante ?? undefined) === undefined
        ? {}
        : { fabricante: dto.fabricante ?? actual.fabricante }),
      ...((dto.modoDeTerminal ?? actual.modoDeTerminal ?? undefined) === undefined
        ? {}
        : { modoDeTerminal: dto.modoDeTerminal ?? actual.modoDeTerminal }),
      canalDeAudioHabilitado: dto.canalDeAudioHabilitado ?? actual.canalDeAudioHabilitado,
      ...(dto.probarConexion === undefined ? {} : { probarConexion: dto.probarConexion }),
    });
    return fusion;
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
      fabricante: dto.fabricante ?? null,
      modoDeTerminal: dto.modoDeTerminal ?? null,
      canalDeAudioHabilitado: dto.canalDeAudioHabilitado ?? false,
    };
  }

  /**
   * El sondeo necesita el secreto, y al editar puede no venir. Sin secreto no
   * se sondea: probar con una credencial que no tenemos produciría un
   * «rechazada» falso, y un rechazo falso invita a reintentar — que es
   * justamente lo que bloquea la cuenta en el equipo.
   */
  private async sondear(
    dto: AltaDeEquipoDto,
    secretoGuardado: string | null = null,
  ): Promise<ResultadoDeSondeo> {
    if (dto.probarConexion === false) return SIN_PROBAR;
    // O4 · al editar sin reescribir la clave se usa la GUARDADA, que sólo
    // existe en el servidor: el sondeo sigue sin necesitar que nadie la vea.
    const secreto = dto.secreto ?? secretoGuardado;
    if (secreto === null || secreto === undefined) {
      return {
        ...SIN_PROBAR,
        detalle:
          'Guardado sin comprobar: el equipo no tiene clave guardada y no se escribió una. ' +
          'Escríbala en la edición para que el sistema pueda sondearlo.',
      };
    }
    return this.sonda.probar({
      host: dto.host,
      puerto: dto.puerto,
      protocolo: dto.protocolo,
      usuario: dto.usuario,
      secreto,
      tipo: dto.tipo,
      canalBarrera: dto.canalBarrera ?? null,
      modoDeTerminal: dto.modoDeTerminal ?? null,
    });
  }

  /** El veredicto a su DTO: la ficha y las capacidades se omiten cuando no las hay. */
  private aResultado(veredicto: ResultadoDeSondeo): ResultadoDeSondeoDto {
    return {
      clase: veredicto.clase,
      detalle: veredicto.detalle,
      modelo: veredicto.modelo,
      firmware: veredicto.firmware,
      latenciaMs: veredicto.latenciaMs,
      verificado: veredicto.verificado,
      ...(veredicto.ficha === undefined ? {} : { ficha: aFicha(veredicto.ficha) }),
      ...(veredicto.capacidades === undefined
        ? {}
        : { capacidades: aCapacidades(veredicto.capacidades) }),
    };
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
    const veredicto = await this.sondear({ ...dto, probarConexion: true });
    // La ficha se omite cuando no la hay, en vez de enviarse vacía: la falta de
    // ficha no es una ficha sin hallazgos (`exactOptionalPropertyTypes`).
    return this.aResultado(veredicto);
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
    @Body() dto: EdicionDeEquipoDto,
  ): Promise<EquipoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/edicion');
    const actual = (await this.repo.listar(ctx, copropiedadId)).find((e) => e.id === equipoId);
    if (actual === undefined) throw new NotFoundException('No se encontró el equipo');
    const completo = this.altaDesdeEdicion(dto, actual);
    const veredicto = await this.sondear(
      completo,
      dto.secreto === undefined
        ? await this.repo.credencialPara(ctx, copropiedadId, equipoId)
        : null,
    );
    const equipo = await this.repo.editar(
      ctx,
      copropiedadId,
      equipoId,
      this.altaDesdeDto(completo),
      veredicto,
    );
    if (equipo === null) throw new NotFoundException('No se encontró el equipo');
    return this.aDto(equipo);
  }

  /**
   * O4 · LA FICHA DE UN EQUIPO YA DADO DE ALTA
   *
   * Hasta ahora la ficha sólo existía en el alta, con la clave recién tecleada.
   * Un equipo en servicio no tenía forma de volver a diagnosticarse sin
   * reescribirla. Aquí se sondea con la credencial GUARDADA —que no sale del
   * servidor—, se persiste lo que cambió (verificación, modelo, firmware,
   * capacidades) y se devuelve la ficha por tipo, con sus botones de
   * corrección. Deja rastro: es una lectura del equipo, no un cambio, pero
   * «quién lo sondeó y cuándo» es lo que explica un `verificado_en` nuevo.
   */
  @Post(':equipoId/diagnostico')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({
    summary: 'Sondea un equipo en servicio con su clave guardada y devuelve su ficha',
  })
  @ApiOkResponse({ type: ResultadoDeSondeoDto })
  async diagnosticar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
  ): Promise<ResultadoDeSondeoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/diagnostico');
    const equipos = await this.repo.listar(ctx, copropiedadId);
    const equipo = equipos.find((e) => e.id === equipoId);
    if (equipo === undefined) throw new NotFoundException('No se encontró el equipo');
    const secreto = await this.repo.credencialPara(ctx, copropiedadId, equipoId);
    if (secreto === null) {
      throw new NotFoundException(
        'El equipo no tiene credencial guardada: vuelva a escribirla en la edición antes de ' +
          'sondearlo, porque el sistema no la muestra ni la reenvía',
      );
    }
    const veredicto = await this.sonda.probar({
      host: equipo.host,
      puerto: equipo.puerto,
      protocolo: equipo.protocolo,
      usuario: equipo.usuario ?? '',
      secreto,
      tipo: equipo.tipo,
      canalBarrera: equipo.canalBarrera,
      modoDeTerminal: equipo.modoDeTerminal,
    });
    await this.repo.registrarSondeo(ctx, copropiedadId, equipoId, veredicto);
    return this.aResultado(veredicto);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CORREGIR UN CAMPO DEL EQUIPO DESDE LA CONSOLA
   *
   * El diagnóstico dice qué está mal y cuál debería ser el valor. Sin esto, el
   * operador tiene que ir al panel del aparato, encontrar el campo y cambiarlo
   * a mano — y en un conjunto con doce cámaras eso no lo hace nadie.
   *
   * Tres cosas que no se negocian:
   *
   * 1 · **Confirmación de una persona.** El identificador de quien la pide
   *     viaja hasta el adaptador, y sin él la petición al equipo no se emite.
   * 2 · **Constancia del valor anterior y el nuevo** en `auditoria_seguridad`.
   *     «Alguien corrigió algo» no permite reconstruir nada.
   * 3 · **La credencial no viaja de vuelta.** Se lee del sobre cifrado en el
   *     servidor, se usa, y no sale por ninguna respuesta.
   */
  @Post(':equipoId/correcciones')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Corrige un campo del equipo. Exige confirmación y deja constancia' })
  @ApiOkResponse({ type: ResultadoDeCorreccionDto })
  async corregir(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Body() dto: CorreccionDeEquipoDto,
  ): Promise<ResultadoDeCorreccionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/correccion');

    const equipos = await this.repo.listar(ctx, copropiedadId);
    const equipo = equipos.find((e) => e.id === equipoId);
    // El 404 no dice qué equipo era: un equipo de otra copropiedad y uno que no
    // existe se ven igual desde fuera, que es lo que RN-15 exige.
    if (equipo === undefined) throw new NotFoundException('No se encontró el equipo');

    const secreto = await this.repo.credencialPara(ctx, copropiedadId, equipoId);
    if (secreto === null) {
      throw new NotFoundException(
        'El equipo no tiene credencial guardada: vuelva a escribirla en la edición antes de ' +
          'corregirlo, porque el sistema no la muestra ni la reenvía',
      );
    }

    const resultado = await this.corrector.corregir({
      host: equipo.host,
      puerto: equipo.puerto,
      protocolo: equipo.protocolo,
      usuario: equipo.usuario ?? '',
      secreto,
      correccion: dto.correccion,
      confirmadaPor: ctx.usuarioId,
    });

    await this.repo.auditarCorreccion(
      ctx,
      copropiedadId,
      `${equipo.nombre} · ${dto.correccion}: ${resultado.valorAnterior ?? '(sin valor)'} → ` +
        `${resultado.valorNuevo ?? '(sin cambio)'} · ${dto.motivo}`,
    );

    return { ...resultado };
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
