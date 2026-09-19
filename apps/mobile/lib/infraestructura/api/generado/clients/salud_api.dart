// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/listo_dto.dart';
import '../models/salud_dto.dart';

part 'salud_api.g.dart';

@RestApi()
abstract class SaludApi {
  factory SaludApi(Dio dio, {String? baseUrl}) = _SaludApi;

  /// El proceso está vivo
  @GET('/health')
  Future<SaludDto> saludControllerSalud();

  /// La aplicación puede atender tráfico
  @GET('/ready')
  Future<ListoDto> saludControllerListo();
}
