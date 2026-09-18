// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alcance_de_copropiedades_dto.dart';
import '../models/cambios_de_configuracion_dto.dart';
import '../models/configuracion_de_copropiedad_dto.dart';
import '../models/copropiedad_dto.dart';
import '../models/ingesta_aceptada_dto.dart';
import '../models/ingesta_dto.dart';

part 'multiempresa_api.g.dart';

@RestApi()
abstract class MultiempresaApi {
  factory MultiempresaApi(Dio dio, {String? baseUrl}) = _MultiempresaApi;

  /// Enumera las copropiedades que el token alcanza, y solo esas
  @GET('/copropiedades')
  Future<AlcanceDeCopropiedadesDto> copropiedadesControllerListar();

  /// Ruta de identidad de servicio: valida el tenant en la aplicación
  @POST('/copropiedades/ingesta')
  Future<IngestaAceptadaDto> copropiedadesControllerIngerir({
    @Body() required IngestaDto body,
  });

  /// Lee una copropiedad dentro del alcance del token
  @GET('/copropiedades/{id}')
  Future<CopropiedadDto> copropiedadesControllerLeer({
    @Path('id') required String id,
  });

  /// Lee la configuración de una copropiedad del alcance
  @GET('/copropiedades/{id}/configuracion')
  Future<ConfiguracionDeCopropiedadDto> copropiedadesControllerLeerConfiguracion({
    @Path('id') required String id,
  });

  /// Cambia la configuración editable y lo anota en auditoria_seguridad
  @PATCH('/copropiedades/{id}/configuracion')
  Future<ConfiguracionDeCopropiedadDto> copropiedadesControllerCambiarConfiguracion({
    @Path('id') required String id,
    @Body() required CambiosDeConfiguracionDto body,
  });
}
