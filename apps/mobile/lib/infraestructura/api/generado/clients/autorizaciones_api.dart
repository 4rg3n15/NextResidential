// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/acompanante_agregado_dto.dart';
import '../models/agregar_acompanante_dto.dart';
import '../models/autorizacion_dto.dart';
import '../models/crear_autorizacion_dto.dart';
import '../models/fotografia_adjuntada_dto.dart';
import '../models/fotografia_de_visitante_dto.dart';
import '../models/id_autorizacion_dto.dart';
import '../models/modificacion_dto.dart';
import '../models/modificar_autorizacion_dto.dart';
import '../models/revocacion_dto.dart';
import '../models/revocar_autorizacion_dto.dart';
import '../models/url_de_fotografia_dto.dart';
import '../models/ver.dart';

part 'autorizaciones_api.g.dart';

@RestApi()
abstract class AutorizacionesApi {
  factory AutorizacionesApi(Dio dio, {String? baseUrl}) = _AutorizacionesApi;

  /// Autorizaciones activas o historial completo (HU-16, HU-17)
  @GET('/copropiedades/{id}/autorizaciones')
  Future<List<AutorizacionDto>> autorizacionesControllerListar({
    @Path('id') required String id,
    @Query('ver') Ver? ver,
  });

  /// Crea una autorización, única o recurrente (HU-07, HU-09, RN-22)
  @POST('/copropiedades/{id}/autorizaciones')
  Future<IdAutorizacionDto> autorizacionesControllerCrearAutorizacion({
    @Path('id') required String id,
    @Body() required CrearAutorizacionDto body,
  });

  /// Cambia fin de vigencia, placa u observaciones de una viva (O3)
  @PUT('/copropiedades/{id}/autorizaciones/{autorizacionId}')
  Future<ModificacionDto> autorizacionesControllerModificarAutorizacion({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
    @Body() required ModificarAutorizacionDto body,
  });

  /// Añade un acompañante por su propia identidad (HU-08, D-01)
  @POST('/copropiedades/{id}/autorizaciones/{autorizacionId}/acompanantes')
  Future<AcompananteAgregadoDto> autorizacionesControllerAgregarAcompanante({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
    @Body() required AgregarAcompananteDto body,
  });

  /// Adjunta la fotografía de identificación del visitante (O3, RN-21)
  @POST('/copropiedades/{id}/autorizaciones/{autorizacionId}/fotografia')
  Future<FotografiaAdjuntadaDto> autorizacionesControllerAdjuntarFotografia({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
    @Body() required FotografiaDeVisitanteDto body,
  });

  /// URL firmada de vida corta de la fotografía del visitante (RN-21)
  @GET('/copropiedades/{id}/autorizaciones/{autorizacionId}/fotografia')
  Future<UrlDeFotografiaDto> autorizacionesControllerFotografia({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
  });

  /// Revoca con motivo obligatorio; no borra (HU-10, RN-19)
  @POST('/copropiedades/{id}/autorizaciones/{autorizacionId}/revocacion')
  Future<RevocacionDto> autorizacionesControllerRevocar({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
    @Body() required RevocarAutorizacionDto body,
  });
}
