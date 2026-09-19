// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/evento_ingesta_dto.dart';
import '../models/latido_dto.dart';

part 'ingesta_api.g.dart';

@RestApi()
abstract class IngestaApi {
  factory IngestaApi(Dio dio, {String? baseUrl}) = _IngestaApi;

  /// Recibe un evento firmado del Alarm Server, lo decide y lo registra.
  ///
  /// Exige firma HMAC vigente. Registra el evento en el histórico inmutable, clasifica y escala la alerta si procede, y deduplica por clave de idempotencia (RN-02, RN-03, RN-17, CA-22).
  @POST('/ingesta/eventos')
  Future<void> ingestaControllerRecibir({
    @Body() required EventoIngestaDto body,
  });

  /// Registra el latido de un dispositivo (CA-26)
  @POST('/ingesta/latidos')
  Future<void> ingestaControllerLatido({
    @Body() required LatidoDto body,
  });
}
