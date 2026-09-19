// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/codigos_de_recuperacion_dto.dart';
import '../models/recuperacion_de_factor_dto.dart';
import '../models/recuperar_factor_dto.dart';
import '../models/restablecimiento_registrado_dto.dart';
import '../models/sesion_dto.dart';

part 'autenticacion_api.g.dart';

@RestApi()
abstract class AutenticacionApi {
  factory AutenticacionApi(Dio dio, {String? baseUrl}) = _AutenticacionApi;

  /// Genera los códigos de recuperación del segundo factor
  @POST('/auth/mfa/codigos')
  Future<CodigosDeRecuperacionDto> autenticacionControllerGenerarCodigos();

  /// Retira el factor perdido con un código de recuperación
  @POST('/auth/mfa/recuperacion')
  Future<RecuperacionDeFactorDto> autenticacionControllerRecuperarFactor({
    @Body() required RecuperarFactorDto body,
  });

  /// Registra en auditoría el restablecimiento de la propia contraseña
  @POST('/auth/restablecimiento')
  Future<RestablecimientoRegistradoDto> autenticacionControllerRegistrarRestablecimiento();

  /// Identidad y alcance del token presentado
  @GET('/auth/sesion')
  Future<SesionDto> autenticacionControllerSesion();
}
