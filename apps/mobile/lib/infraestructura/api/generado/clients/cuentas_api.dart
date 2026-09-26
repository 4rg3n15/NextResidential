// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/acceso_dto.dart';
import '../models/cambio_de_contrasena_dto.dart';
import '../models/hecho_de_cuenta_dto.dart';
import '../models/restablecimiento_de_contrasena_dto.dart';
import '../models/sesion_de_acceso_dto.dart';

part 'cuentas_api.g.dart';

@RestApi()
abstract class CuentasApi {
  factory CuentasApi(Dio dio, {String? baseUrl}) = _CuentasApi;

  /// Inicio de sesión por correo o por NIT y usuario
  @POST('/auth/acceso')
  Future<SesionDeAccesoDto> cuentasControllerAcceso({
    @Body() required AccesoDto body,
  });

  /// Cierra la sesión del token presentado
  @POST('/auth/cierre')
  Future<HechoDeCuentaDto> cuentasControllerCierre();

  /// Cambia la propia contraseña; cierra el primer ingreso
  @POST('/auth/contrasena')
  Future<HechoDeCuentaDto> cuentasControllerContrasena({
    @Body() required CambioDeContrasenaDto body,
  });

  /// Restablece la contraseña de una cuenta con una temporal y cambio obligatorio
  @POST('/copropiedades/{id}/usuarios/{usuarioId}/restablecimiento')
  Future<HechoDeCuentaDto> cuentasControllerRestablecimiento({
    @Path('id') required String id,
    @Path('usuarioId') required String usuarioId,
    @Body() required RestablecimientoDeContrasenaDto body,
  });
}
