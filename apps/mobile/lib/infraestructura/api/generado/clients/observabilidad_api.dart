// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/latencias_dto.dart';

part 'observabilidad_api.g.dart';

@RestApi()
abstract class ObservabilidadApi {
  factory ObservabilidadApi(Dio dio, {String? baseUrl}) = _ObservabilidadApi;

  /// p50, p95 y p99 de las cinco latencias comprometidas (KPI-09, 13, 25, 32, 33).
  ///
  /// Cada fila trae el tramo que mide y lo que NO mide. Se leen juntos a propósito: una cifra de latencia sin su tramo no demuestra nada.
  @GET('/observabilidad/latencias')
  Future<LatenciasDto> observabilidadControllerLatencias();
}
