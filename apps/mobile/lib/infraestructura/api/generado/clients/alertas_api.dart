// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alerta_expuesta_dto.dart';
import '../models/archivo_de_alerta_dto.dart';
import '../models/archivo_de_alertas_resultado_dto.dart';
import '../models/archivo_masivo_de_alertas_dto.dart';
import '../models/notas_de_alerta_dto.dart';
import '../models/severidad.dart';
import '../models/tipo.dart';

part 'alertas_api.g.dart';

@RestApi()
abstract class AlertasApi {
  factory AlertasApi(Dio dio, {String? baseUrl}) = _AlertasApi;

  /// Alertas abiertas y en atención, con su cumplimiento de KPI-25
  @GET('/copropiedades/{id}/alertas')
  Future<List<AlertaExpuestaDto>> alertasControllerAbiertas({
    @Path('id') required String id,
    @Query('dispositivoId') String? dispositivoId,
    @Query('severidad') Severidad? severidad,
    @Query('tipo') Tipo? tipo,
    @Query('desde') DateTime? desde,
    @Query('hasta') DateTime? hasta,
  });

  /// Archiva varias alertas con un motivo. Archivo lógico, nunca borrado
  @POST('/copropiedades/{id}/alertas/archivar')
  Future<ArchivoDeAlertasResultadoDto> alertasControllerArchivarVarias({
    @Path('id') required String id,
    @Body() required ArchivoMasivoDeAlertasDto body,
  });

  /// Archiva una alerta con motivo. Archivo lógico, nunca borrado
  @POST('/copropiedades/{id}/alertas/{alertaId}/archivar')
  Future<ArchivoDeAlertasResultadoDto> alertasControllerArchivar({
    @Path('id') required String id,
    @Path('alertaId') required String alertaId,
    @Body() required ArchivoDeAlertaDto body,
  });

  /// El operador toma la alerta; queda atribuida a él
  @POST('/copropiedades/{id}/alertas/{alertaId}/atencion')
  Future<AlertaExpuestaDto> alertasControllerAtender({
    @Path('id') required String id,
    @Path('alertaId') required String alertaId,
  });

  /// Cierra la alerta; las notas son obligatorias
  @POST('/copropiedades/{id}/alertas/{alertaId}/resolucion')
  Future<AlertaExpuestaDto> alertasControllerResolver({
    @Path('id') required String id,
    @Path('alertaId') required String alertaId,
    @Body() required NotasDeAlertaDto body,
  });
}
