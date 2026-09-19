// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/informe_dto.dart';
import '../models/tipo2.dart';

part 'informes_api.g.dart';

@RestApi()
abstract class InformesApi {
  factory InformesApi(Dio dio, {String? baseUrl}) = _InformesApi;

  /// Vista previa y frecuencia semanal de los cuatro informes (HU-32)
  @GET('/copropiedades/{id}/informes')
  Future<InformeDto> informesControllerGenerar({
    @Path('id') required String id,
    @Query('desde') required String desde,
    @Query('hasta') required String hasta,
    @Query('tipo') Tipo2? tipo,
    @Query('viviendaId') String? viviendaId,
    @Query('dispositivoId') String? dispositivoId,
  });
}
