// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/modo_pruebas_dto.dart';

part 'plataforma_api.g.dart';

@RestApi()
abstract class PlataformaApi {
  factory PlataformaApi(Dio dio, {String? baseUrl}) = _PlataformaApi;

  /// Si el modo pruebas está activo
  @GET('/plataforma/modo-pruebas')
  Future<ModoPruebasDto> plataformaControllerLeer();

  /// Activa o desactiva el modo pruebas (sólo superadministrador)
  @PUT('/plataforma/modo-pruebas')
  Future<ModoPruebasDto> plataformaControllerCambiar({
    @Body() required ModoPruebasDto body,
  });
}
