// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alta_de_equipo_dto.dart';
import '../models/baja_de_equipo_dto.dart';
import '../models/correccion_de_equipo_dto.dart';
import '../models/equipo_dto.dart';
import '../models/equipos_dto.dart';
import '../models/resultado_de_correccion_dto.dart';
import '../models/resultado_de_sondeo_dto.dart';

part 'equipos_api.g.dart';

@RestApi()
abstract class EquiposApi {
  factory EquiposApi(Dio dio, {String? baseUrl}) = _EquiposApi;

  /// Equipos de la copropiedad, sin credenciales
  @GET('/copropiedades/{id}/equipos')
  Future<EquiposDto> equiposControllerListar({
    @Path('id') required String id,
  });

  /// Da de alta un equipo; el secreto se guarda cifrado
  @POST('/copropiedades/{id}/equipos')
  Future<EquipoDto> equiposControllerCrear({
    @Path('id') required String id,
    @Body() required AltaDeEquipoDto body,
  });

  /// Prueba la conexión DESDE EL SERVIDOR, sin guardar nada
  @POST('/copropiedades/{id}/equipos/prueba-de-conexion')
  Future<ResultadoDeSondeoDto> equiposControllerProbar({
    @Path('id') required String id,
    @Body() required AltaDeEquipoDto body,
  });

  /// Edita un equipo. Sin «secreto» en el cuerpo, la clave no cambia
  @PUT('/copropiedades/{id}/equipos/{equipoId}')
  Future<EquipoDto> equiposControllerEditar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required AltaDeEquipoDto body,
  });

  /// Baja lógica con motivo. Nunca borrado físico (RN-19)
  @POST('/copropiedades/{id}/equipos/{equipoId}/baja')
  Future<EquipoDto> equiposControllerDesactivar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required BajaDeEquipoDto body,
  });

  /// Corrige un campo del equipo. Exige confirmación y deja constancia
  @POST('/copropiedades/{id}/equipos/{equipoId}/correcciones')
  Future<ResultadoDeCorreccionDto> equiposControllerCorregir({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required CorreccionDeEquipoDto body,
  });

  /// Vuelve a poner en servicio un equipo dado de baja
  @POST('/copropiedades/{id}/equipos/{equipoId}/reactivacion')
  Future<EquipoDto> equiposControllerReactivar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
  });
}
