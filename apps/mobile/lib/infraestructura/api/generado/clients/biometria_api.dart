// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/capturar_rostro_dto.dart';
import '../models/responder_consentimiento_dto.dart';
import '../models/sincronizar_plantilla_dto.dart';

part 'biometria_api.g.dart';

@RestApi()
abstract class BiometriaApi {
  factory BiometriaApi(Dio dio, {String? baseUrl}) = _BiometriaApi;

  /// Supresión de las vencidas y retirada de terminales (RN-11, KPI-21)
  @POST('/copropiedades/{id}/biometria/barrido')
  Future<void> biometriaControllerEjecutarBarrido({
    @Path('id') required String id,
  });

  /// Valida la calidad y solicita el consentimiento al TITULAR (CU-02, CA-08)
  @POST('/copropiedades/{id}/biometria/capturas')
  Future<void> biometriaControllerCapturarRostro({
    @Path('id') required String id,
    @Body() required CapturarRostroDto body,
  });

  /// Estado de un consentimiento, sin dato biométrico alguno
  @GET('/copropiedades/{id}/biometria/consentimientos/{consentimientoId}')
  Future<void> biometriaControllerVerConsentimiento({
    @Path('id') required String id,
    @Path('consentimientoId') required String consentimientoId,
  });

  /// El TITULAR acepta o rechaza. Nadie responde por él (RN-10)
  @POST('/copropiedades/{id}/biometria/consentimientos/{consentimientoId}/respuesta')
  Future<void> biometriaControllerResponderConsentimiento({
    @Path('id') required String id,
    @Path('consentimientoId') required String consentimientoId,
    @Body() required ResponderConsentimientoDto body,
  });

  /// Revocación del titular: supresión inmediata (RN-11, CA-11)
  @POST('/copropiedades/{id}/biometria/consentimientos/{consentimientoId}/revocacion')
  Future<void> biometriaControllerRevocarConsentimiento({
    @Path('id') required String id,
    @Path('consentimientoId') required String consentimientoId,
  });

  /// Empuja la plantilla a una terminal, si hay consentimiento (RN-09)
  @POST('/copropiedades/{id}/biometria/plantillas/{plantillaId}/sincronizacion')
  Future<void> biometriaControllerSincronizarPlantilla({
    @Path('id') required String id,
    @Path('plantillaId') required String plantillaId,
    @Body() required SincronizarPlantillaDto body,
  });
}
