// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alta_de_portero_dto.dart';
import '../models/baja_de_portero_dto.dart';
import '../models/bitacora_de_porteria_dto.dart';
import '../models/cupo_de_porteros_dto.dart';
import '../models/datos_de_turno_dto.dart';
import '../models/datos_del_portero_dto.dart';
import '../models/desbloqueo_dto.dart';
import '../models/estado_de_sesion_dto.dart';
import '../models/hecho_de_porteria_dto.dart';
import '../models/pool_de_porteros_dto.dart';
import '../models/portero_creado_dto.dart';
import '../models/portero_dto.dart';
import '../models/porteros_dto.dart';
import '../models/resultado_de_desbloqueo_dto.dart';
import '../models/retiro_de_turno_dto.dart';
import '../models/tipo4.dart';
import '../models/turno_guardado_dto.dart';
import '../models/turnos_dto.dart';

part 'porteria_api.g.dart';

@RestApi()
abstract class PorteriaApi {
  factory PorteriaApi(Dio dio, {String? baseUrl}) = _PorteriaApi;

  /// Bitácora append-only: ingresos con origen, patrullajes, turnos, restablecimientos
  @GET('/copropiedades/{id}/porteria/bitacora')
  Future<BitacoraDePorteriaDto> supervisionControllerBitacora({
    @Path('id') required String id,
    @Query('desde') required DateTime desde,
    @Query('hasta') required DateTime hasta,
    @Query('tipo') Tipo4? tipo,
  });

  /// Porteros de la copropiedad, quién está de turno y con sesión
  @GET('/copropiedades/{id}/porteros')
  Future<PorterosDto> supervisionControllerListar({
    @Path('id') required String id,
  });

  /// Alta de portero con nombre, documento y contraseña temporal; recibe el siguiente número del pool (cambio de contraseña obligatorio)
  @POST('/copropiedades/{id}/porteros')
  Future<PorteroCreadoDto> supervisionControllerAlta({
    @Path('id') required String id,
    @Body() required AltaDePorteroDto body,
  });

  /// Cupo de porteros activos de la copropiedad (0 a 999), auditado
  @PUT('/copropiedades/{id}/porteros/cupo')
  Future<HechoDePorteriaDto> poolDePorterosControllerFijarCupo({
    @Path('id') required String id,
    @Body() required CupoDePorterosDto body,
  });

  /// Pool de números de portero de la copropiedad, el siguiente a asignar y el cupo
  @GET('/copropiedades/{id}/porteros/pool')
  Future<PoolDePorterosDto> poolDePorterosControllerPool({
    @Path('id') required String id,
  });

  /// Datos del portero (nombre, teléfono, correo de contacto, portería, sectores)
  @PUT('/copropiedades/{id}/porteros/{usuarioId}')
  Future<HechoDePorteriaDto> supervisionControllerEditar({
    @Path('id') required String id,
    @Path('usuarioId') required String usuarioId,
    @Body() required DatosDelPorteroDto body,
  });

  /// Da de baja a un portero: cierra sus sesiones y su número no se reutiliza
  @POST('/copropiedades/{id}/porteros/{usuarioId}/baja')
  Future<HechoDePorteriaDto> poolDePorterosControllerBaja({
    @Path('id') required String id,
    @Path('usuarioId') required String usuarioId,
    @Body() required BajaDePorteroDto body,
  });

  /// Calendario de turnos en un rango (hasta 62 días)
  @GET('/copropiedades/{id}/turnos')
  Future<TurnosDto> supervisionControllerTurnos({
    @Path('id') required String id,
    @Query('desde') required DateTime desde,
    @Query('hasta') required DateTime hasta,
  });

  /// Asigna un turno (programado o extra con motivo); los solapes se registran
  @POST('/copropiedades/{id}/turnos')
  Future<TurnoGuardadoDto> supervisionControllerAsignar({
    @Path('id') required String id,
    @Body() required DatosDeTurnoDto body,
  });

  /// Edita un turno que no ha terminado
  @PUT('/copropiedades/{id}/turnos/{turnoId}')
  Future<TurnoGuardadoDto> supervisionControllerEditarTurno({
    @Path('id') required String id,
    @Path('turnoId') required String turnoId,
    @Body() required DatosDeTurnoDto body,
  });

  /// Retira un turno que no ha terminado, con motivo
  @POST('/copropiedades/{id}/turnos/{turnoId}/retiro')
  Future<HechoDePorteriaDto> supervisionControllerRetirar({
    @Path('id') required String id,
    @Path('turnoId') required String turnoId,
    @Body() required RetiroDeTurnoDto body,
  });

  /// El perfil del propio portero, de solo lectura
  @GET('/porteria/perfil')
  Future<PorteroDto> porteriaControllerMiPerfil();

  /// Estado de la sesión: activa (con código), patrullaje, cerrada o fuera de turno
  @GET('/porteria/sesion')
  Future<EstadoDeSesionDto> porteriaControllerSesion();

  /// Termina el patrullaje con el código; el 5.º fallo cierra la sesión
  @POST('/porteria/sesion/desbloqueo')
  Future<ResultadoDeDesbloqueoDto> porteriaControllerDesbloqueo({
    @Body() required DesbloqueoDto body,
  });

  /// Pone la sesión en patrullaje: la API rechaza toda acción hasta el código
  @POST('/porteria/sesion/patrullaje')
  Future<EstadoDeSesionDto> porteriaControllerIniciarPatrullaje();
}
