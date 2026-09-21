// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/evento_ingesta_dto.dart';
import '../models/latido_dto.dart';
import '../models/lote_de_reconciliacion_dto.dart';
import '../models/lote_reconciliado_dto.dart';

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

  /// Recibe la bandeja de un Edge Gateway tras un corte de WAN (CU-04).
  ///
  /// NO vuelve a decidir: cada evento trae la decisión que el gateway tomó, sellada con su versión de reglas (RN-16, CA-21). Deduplica por clave de idempotencia y responde 202 también a los duplicados (RN-17, CA-22).
  @POST('/ingesta/reconciliacion')
  Future<LoteReconciliadoDto> ingestaControllerReconciliar({
    @Body() required LoteDeReconciliacionDto body,
  });
}
