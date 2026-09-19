// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/pendientes_dto.dart';
import '../models/resultado_de_operacion_dto.dart';

part 'dispositivos_api.g.dart';

@RestApi()
abstract class DispositivosApi {
  factory DispositivosApi(Dio dio, {String? baseUrl}) = _DispositivosApi;

  /// Equipos con una orden sin ejecutar (se muestran «sincronizando»)
  @GET('/copropiedades/{id}/dispositivos/pendientes')
  Future<PendientesDto> dispositivosControllerPendientes({
    @Path('id') required String id,
  });

  /// Encola la reconfiguración del equipo, atribuida a quien la pide
  @POST('/copropiedades/{id}/dispositivos/{dispositivoId}/configuracion')
  Future<ResultadoDeOperacionDto> dispositivosControllerConfigurar({
    @Path('id') required String id,
    @Path('dispositivoId') required String dispositivoId,
  });

  /// Encola el reinicio del equipo; queda auditado quién lo ordenó
  @POST('/copropiedades/{id}/dispositivos/{dispositivoId}/reinicio')
  Future<ResultadoDeOperacionDto> dispositivosControllerReiniciar({
    @Path('id') required String id,
    @Path('dispositivoId') required String dispositivoId,
  });

  /// Encola la sincronización de plantillas y reglas del equipo
  @POST('/copropiedades/{id}/dispositivos/{dispositivoId}/sincronizacion')
  Future<ResultadoDeOperacionDto> dispositivosControllerSincronizar({
    @Path('id') required String id,
    @Path('dispositivoId') required String dispositivoId,
  });
}
