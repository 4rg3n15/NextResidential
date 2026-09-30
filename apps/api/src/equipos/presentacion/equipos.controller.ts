import {
  Body,
  BadRequestException,
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
import { RELOJ, vigenciaDeAtestacion } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { LECTOR_DE_SENALES, hallazgoDeEventos } from '../aplicacion/senal-de-eventos';
import { entradasDeEstado, estadoDelEquipo } from '../aplicacion/estado-del-equipo';
import { ModuleRef } from '@nestjs/core';
import { RETIRO_DE_PLANTILLAS_DE_EQUIPO } from '../aplicacion/retiro-de-plantillas';
import { ARCHIVO_DE_ALERTAS_DEL_EQUIPO } from '../aplicacion/archivo-de-alertas-del-equipo';
import {
  REENVIO_DE_PLANTILLAS_A_EQUIPO,
  recibePlantillas,
} from '../aplicacion/reenvio-de-plantillas';
import type { ReenvioDePlantillasAEquipo } from '../aplicacion/reenvio-de-plantillas';
import type { ArchivoDeAlertasDelEquipo } from '../aplicacion/archivo-de-alertas-del-equipo';
import type {
  ResultadoDeRetiroDePlantillas,
  RetiroDePlantillasDeEquipo,
} from '../aplicacion/retiro-de-plantillas';
import { aEstadoDelEquipoDto } from './dto-estado-del-equipo';
import type { LectorDeSenales } from '../aplicacion/senal-de-eventos';
import { conDatosGuardados, conReceptorDeLaPlataforma } from '../aplicacion/ficha-en-servicio';
import {
  CORRECTOR_DE_EQUIPO,
  OLVIDO_DE_EQUIPO,
  RECEPTOR_ESPERADO,
  REPOSITORIO_DE_ATESTACIONES,
  REPOSITORIO_DE_EQUIPOS,
  SIN_PROBAR,
  SONDA_DE_EQUIPO,
} from '../aplicacion/puertos';
import type {
  AltaDeEquipo,
  AtestacionDelInstalador,
  CorrectorDeEquipo,
  DatosDeEquipo,
  OlvidoDeEquipo,
  RepositorioDeAtestaciones,
  RepositorioDeEquipos,
  ResolutorDeReceptorEsperado,
  ResultadoDeSondeo,
  SondaDeEquipo,
} from '../aplicacion/puertos';
import {
  BajaDeEquipoResultadoDto,
  AltaDeEquipoDto,
  BajaDeEquipoDto,
  CapacidadesDeEquipoDto,
  CorreccionDeEquipoDto,
  EquipoCreadoDto,
  EquipoDto,
  EquiposDto,
  FichaDelEquipoDto,
  ResultadoDeCorreccionDto,
  ResultadoDeSondeoDto,
  EdicionDeEquipoDto,
} from './dtos';
import type { AtestacionDeEquipoDto } from './dtos-atestacion';
import { SECRETOS_DE_ALARM_SERVER } from '../aplicacion/secretos-de-alarm-server';
import type { SecretosDeAlarmServer } from '../aplicacion/secretos-de-alarm-server';

/**
 * D-11 · la atestación a su DTO, con la vigencia calculada contra el firmware
 * del último sondeo. El proveedor la vuelve a comprobar EN VIVO antes de operar.
 */
export const aAtestacionDto = (
  a: AtestacionDelInstalador,
  firmwareActual: string | null,
): AtestacionDeEquipoDto => {
  const vigencia = vigenciaDeAtestacion(a, firmwareActual);
  return {
    id: a.id,
    firmware: a.firmware,
    placaEnListaBlanca: a.placaEnListaBlanca,
    placaDesconocida: a.placaDesconocida,
    evidencia: a.evidencia,
    registradaEn: a.registradaEn,
    registradaPor: a.registradaPor,
    vigente: vigencia.vigente,
    motivoSinEfecto: vigencia.vigente ? null : vigencia.motivo,
  };
};

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
  ...(ficha.crudos === undefined
    ? {}
    : { crudos: ficha.crudos.map((c) => ({ titulo: c.titulo, contenido: c.contenido })) }),
  // E4 (15-M) · el receptor, campo a campo y con la ruta ya sin secreto.
  ...(ficha.receptores === undefined
    ? {}
    : {
        receptores: ficha.receptores.map((r) => ({ host: r.host, puerto: r.puerto, ruta: r.ruta })),
      }),
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
  video: { ...c.video },
});

/**
 * C2 (15-L) · la zona es de la copropiedad por clave ajena compuesta: una de
 * otra copropiedad, o que no existe, la rechaza la base (23503). Se dice así, y
 * con 400, en vez de un 500 que no explica nada.
 */
const zonaAjena = (error: unknown): never => {
  if ((error as { code?: unknown } | null)?.code === '23503') {
    throw new BadRequestException('La zona no existe en esta copropiedad');
  }
  throw error;
};

@ApiTags('equipos')
@ApiBearerAuth()
@Controller('copropiedades/:id/equipos')
export class EquiposController {
  constructor(
    @Inject(REPOSITORIO_DE_EQUIPOS) private readonly repo: RepositorioDeEquipos,
    @Inject(SONDA_DE_EQUIPO) private readonly sonda: SondaDeEquipo,
    @Inject(CORRECTOR_DE_EQUIPO) private readonly corrector: CorrectorDeEquipo,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(REPOSITORIO_DE_ATESTACIONES) private readonly atestaciones: RepositorioDeAtestaciones,
    @Inject(OLVIDO_DE_EQUIPO) private readonly olvido: OlvidoDeEquipo,
    @Inject(LECTOR_DE_SENALES) private readonly senales: LectorDeSenales,
    /** C4 (15-M) · para resolver el retiro de rostros sin importar biometría. */
    @Inject(ModuleRef) private readonly modulos: ModuleRef,
    @Inject(RELOJ) private readonly reloj: Reloj,
    /** E4 (15-M) · a dónde debería publicar el equipo para llegar a esta plataforma. */
    @Inject(RECEPTOR_ESPERADO) private readonly receptorEsperado: ResolutorDeReceptorEsperado,
    /** C6 (15-M) · el secreto de Alarm Server que se emite al dar de alta una cámara. */
    @Inject(SECRETOS_DE_ALARM_SERVER) private readonly secretos: SecretosDeAlarmServer,
  ) {}

  /** D-11 · los equipos con su atestación más reciente, en una sola consulta. */
  private async aDtos(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipos: readonly DatosDeEquipo[],
  ): Promise<EquipoDto[]> {
    const ultimas = await this.atestaciones.ultimasPorEquipo(ctx, copropiedadId);
    return equipos.map((e) => this.aDto(e, ultimas.get(e.id) ?? null));
  }

  private async aDtoCompleto(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipo: DatosDeEquipo,
  ): Promise<EquipoDto> {
    const [dto] = await this.aDtos(ctx, copropiedadId, [equipo]);
    return dto ?? this.aDto(equipo, null);
  }

  /**
   * Campo a campo y NUNCA con `spread` (§7.1): `DatosDeEquipo` lleva host,
   * puerto, protocolo y usuario porque la sonda y el corrector los necesitan
   * en el servidor; ninguno cruza al cliente.
   */
  private aDto(e: DatosDeEquipo, atestacion: AtestacionDelInstalador | null): EquipoDto {
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
      canalDeVideo: e.canalDeVideo,
      zonaId: e.zonaId,
      capacidades: e.capacidades === null ? null : aCapacidades(e.capacidades),
      verificacion: e.verificacion,
      verificadoEn: e.verificadoEn,
      motivoNoVerificado: e.motivoNoVerificado,
      estado: e.estado,
      atestacion: atestacion === null ? null : aAtestacionDto(atestacion, e.firmware),
      // E5 (15-M) · el MISMO criterio que la ficha y el tablero, con la señal
      // de la escucha del proceso y el reloj inyectado.
      estadoDelEquipo: aEstadoDelEquipoDto(
        estadoDelEquipo(entradasDeEstado(e, this.senales.senal(e.id)), this.reloj.ahora()),
      ),
      sondeadoEn: e.sondeadoEn,
      identidadLeidaEn: e.identidadLeidaEn,
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
      ...((dto.canalDeVideo ?? actual.canalDeVideo ?? undefined) === undefined
        ? {}
        : { canalDeVideo: dto.canalDeVideo ?? actual.canalDeVideo }),
      // O2 (15-N) · `null` es «sin zona»: no se rellena con la guardada.
      ...(dto.zonaId === null || (dto.zonaId ?? actual.zonaId ?? undefined) === undefined
        ? {}
        : { zonaId: dto.zonaId ?? actual.zonaId }),
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
      canalDeVideo: dto.canalDeVideo ?? null,
      zonaId: dto.zonaId ?? null,
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
      canalDeVideo: dto.canalDeVideo ?? null,
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
    return {
      equipos: await this.aDtos(ctx, copropiedadId, await this.repo.listar(ctx, copropiedadId)),
    };
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
  @ApiOperation({
    summary:
      'Da de alta un equipo; el secreto se guarda cifrado. Una cámara LPR recibe además su ' +
      'secreto de Alarm Server, que se muestra SOLO en esta respuesta',
  })
  @ApiOkResponse({ type: EquipoCreadoDto })
  async crear(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: AltaDeEquipoDto,
  ): Promise<EquipoCreadoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/alta');
    const veredicto = await this.sondear(dto);
    const equipo = await this.repo
      .crear(ctx, copropiedadId, this.altaDesdeDto(dto), veredicto)
      .catch(zonaAjena);
    // C6 (15-M) · la cámara nace con su secreto de Alarm Server: lo emite la
    // API, se guarda cifrado (0045) y sale UNA vez, aquí. Nada de .env.
    const secretoDelAlarmServer =
      equipo.tipo === 'camara_lpr'
        ? await this.secretos.emitir(ctx, copropiedadId, { id: equipo.id, host: equipo.host })
        : null;
    // R1 (15-N) · nace recibiendo plantillas: las vigentes le llegan ya.
    await this.siEmpiezaARecibir(copropiedadId, equipo.id, null, equipo.capacidades);
    return { ...(await this.aDtoCompleto(ctx, copropiedadId, equipo)), secretoDelAlarmServer };
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
    const equipo = await this.repo
      .editar(ctx, copropiedadId, equipoId, this.altaDesdeDto(completo), veredicto)
      .catch(zonaAjena);
    if (equipo === null) throw new NotFoundException('No se encontró el equipo');
    this.olvido.olvidar(equipoId);
    // R1 (15-N) · la edición volvió a sondear: si ahora recibe plantillas, las que le faltan.
    await this.siEmpiezaARecibir(copropiedadId, equipoId, actual.capacidades, equipo.capacidades);
    return this.aDtoCompleto(ctx, copropiedadId, equipo);
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
    const sondeado = await this.sonda.probar({
      host: equipo.host,
      puerto: equipo.puerto,
      protocolo: equipo.protocolo,
      usuario: equipo.usuario ?? '',
      secreto,
      tipo: equipo.tipo,
      canalBarrera: equipo.canalBarrera,
      modoDeTerminal: equipo.modoDeTerminal,
      canalDeVideo: equipo.canalDeVideo,
    });
    await this.repo.registrarSondeo(ctx, copropiedadId, equipoId, sondeado);
    // R1 (15-N) · «Probar conexión» descubrió que recibe plantillas: las que le faltan.
    if (equipo.estado === 'activo') {
      await this.siEmpiezaARecibir(
        copropiedadId,
        equipoId,
        equipo.capacidades,
        sondeado.capacidades ?? equipo.capacidades,
      );
    }
    // E4 · 7 / E5 · 10 (15-M) · ¿publica en ESTA plataforma?, y los datos
    // guardados con su fecha cuando el sondeo de hoy no los leyó.
    const veredicto = conDatosGuardados(
      sondeado.ficha === undefined
        ? sondeado
        : {
            ...sondeado,
            ficha: conReceptorDeLaPlataforma(
              sondeado.ficha,
              this.receptorEsperado.hacia(equipo.host),
              equipo.tipo,
            ),
          },
      equipo,
    );
    // C1 (15-L) · capacidades nuevas en la base: el proceso deja las viejas.
    this.olvido.olvidar(equipoId);
    // C3 (15-L) · eventos: la señal real de la escucha, no una segunda conexión.
    const emite = equipo.tipo === 'terminal_facial' || equipo.tipo === 'intercom';
    const resultado = this.aResultado(
      emite && veredicto.ficha !== undefined
        ? {
            ...veredicto,
            ficha: {
              ...veredicto.ficha,
              hallazgos: [
                ...veredicto.ficha.hallazgos,
                hallazgoDeEventos(this.senales.senal(equipoId), this.reloj.ahora()),
              ],
            },
          }
        : veredicto,
    );
    return veredicto.identidadDel === null
      ? resultado
      : { ...resultado, identidadDel: veredicto.identidadDel };
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
    // C1 (15-L) · el equipo cambió de configuración: lo recordado ya no vale.
    this.olvido.olvidar(equipoId);

    return { ...resultado };
  }

  @Post(':equipoId/baja')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({
    summary:
      'Baja lógica con motivo (RN-19). Antes, retira del equipo los rostros sincronizados ' +
      '(RN-11); los que no pudo quitar se devuelven como pendientes',
  })
  @ApiOkResponse({ type: BajaDeEquipoResultadoDto })
  async desactivar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('equipoId', ParseUUIDPipe) equipoId: string,
    @Body() dto: BajaDeEquipoDto,
  ): Promise<BajaDeEquipoResultadoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'equipos/baja');
    // C4 (15-M) · los rostros salen ANTES de la baja: después el proveedor ya
    // no encuentra el equipo en el registro y no podría hablarle.
    const retiro =
      (await this.repo.copropiedadDeActivo(equipoId)) === copropiedadId
        ? await this.retirarPlantillas(ctx, copropiedadId, equipoId)
        : { retiradas: 0, pendientes: 0 };
    const equipo = await this.repo.desactivar(ctx, copropiedadId, equipoId, dto.motivo);
    if (equipo === null) throw new NotFoundException('No se encontró el equipo');
    // A1 (15-N) · sus alertas abiertas no las va a cerrar nadie: se archivan.
    const archivadas = await this.archivarAlertas(
      copropiedadId,
      equipoId,
      dto.motivo,
      ctx.usuarioId,
    );
    if (archivadas > 0) {
      await this.repo.auditarCorreccion(
        ctx,
        copropiedadId,
        `${equipo.nombre} · baja: ${String(archivadas)} alerta(s) abierta(s) archivada(s)`,
      );
    }
    if (retiro.retiradas + retiro.pendientes > 0) {
      await this.repo.auditarCorreccion(
        ctx,
        copropiedadId,
        `${equipo.nombre} · baja: ${String(retiro.retiradas)} rostro(s) retirado(s) del equipo, ` +
          `${String(retiro.pendientes)} pendiente(s) (el equipo no contestó)`,
      );
    }
    this.olvido.olvidar(equipoId);
    return {
      ...(await this.aDtoCompleto(ctx, copropiedadId, equipo)),
      plantillasRetiradas: retiro.retiradas,
      plantillasPendientes: retiro.pendientes,
    };
  }

  /**
   * R1 (15-N) · de «no recibe» (o «no se sabe») a «recibe plantillas»: se
   * encolan las vigentes que le faltan. Por `ModuleRef`: la planificación
   * importa biometría, que importa equipos. Nunca lanza.
   */
  private async siEmpiezaARecibir(
    copropiedadId: string,
    equipoId: string,
    antes: Parameters<typeof recibePlantillas>[0],
    despues: Parameters<typeof recibePlantillas>[0],
  ): Promise<void> {
    if (!recibePlantillas(despues) || recibePlantillas(antes)) return;
    let reenvio: ReenvioDePlantillasAEquipo | null = null;
    try {
      reenvio = this.modulos.get<ReenvioDePlantillasAEquipo>(REENVIO_DE_PLANTILLAS_A_EQUIPO, {
        strict: false,
      });
    } catch {
      return;
    }
    await reenvio.encolar(copropiedadId, equipoId);
  }

  /** Por `ModuleRef`, como el retiro: eventos importa (vía biometría) equipos. */
  private async archivarAlertas(
    copropiedadId: string,
    equipoId: string,
    motivo: string,
    actorId: string,
  ): Promise<number> {
    let archivo: ArchivoDeAlertasDelEquipo | null = null;
    try {
      archivo = this.modulos.get<ArchivoDeAlertasDelEquipo>(ARCHIVO_DE_ALERTAS_DEL_EQUIPO, {
        strict: false,
      });
    } catch {
      return 0;
    }
    return archivo.archivarPorBaja(copropiedadId, equipoId, motivo, actorId);
  }

  /** Por `ModuleRef`: biometría importa equipos, así que equipos no la importa. */
  private async retirarPlantillas(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<ResultadoDeRetiroDePlantillas> {
    let retiro: RetiroDePlantillasDeEquipo | null = null;
    try {
      retiro = this.modulos.get<RetiroDePlantillasDeEquipo>(RETIRO_DE_PLANTILLAS_DE_EQUIPO, {
        strict: false,
      });
    } catch {
      return { retiradas: 0, pendientes: 0 };
    }
    return retiro.ejecutar(ctx, copropiedadId, equipoId);
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
    this.olvido.olvidar(equipoId);
    return this.aDtoCompleto(ctx, copropiedadId, equipo);
  }
}
