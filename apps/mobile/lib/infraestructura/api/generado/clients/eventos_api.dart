// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/formato.dart';
import '../models/motivo.dart';
import '../models/pagina_de_eventos_dto.dart';
import '../models/resultado.dart';
import '../models/tipo.dart';
import '../models/url_de_evidencia_dto.dart';

part 'eventos_api.g.dart';

@RestApi()
abstract class EventosApi {
  factory EventosApi(Dio dio, {String? baseUrl}) = _EventosApi;

  /// Historial filtrado y paginado por cursor (HU-32).
  ///
  /// [desde] - Inicio del rango, ISO-8601 con zona.
  ///
  /// [hasta] - Fin del rango, EXCLUIDO.
  ///
  /// [cursor] - Cursor opaco devuelto por la página anterior.
  @GET('/copropiedades/{id}/eventos')
  Future<PaginaDeEventosDto> eventosControllerHistorial({
    @Path('id') required String id,
    @Query('desde') required String desde,
    @Query('hasta') required String hasta,
    @Query('viviendaId') String? viviendaId,
    @Query('personaId') String? personaId,
    @Query('dispositivoId') String? dispositivoId,
    @Query('zonaId') String? zonaId,
    @Query('tipo') Tipo? tipo,
    @Query('resultado') Resultado? resultado,
    @Query('motivo') Motivo? motivo,
    @Query('tamanoPagina') num? tamanoPagina,
    @Query('cursor') String? cursor,
  });

  /// Exporta el historial en CSV, Excel o PDF (HU-32).
  ///
  /// [desde] - Inicio del rango, ISO-8601 con zona.
  ///
  /// [hasta] - Fin del rango, EXCLUIDO.
  ///
  /// [cursor] - Cursor opaco devuelto por la página anterior.
  @GET('/copropiedades/{id}/eventos/exportacion')
  @DioResponseType(ResponseType.stream)
  Stream<String> eventosControllerExportacion({
    @Path('id') required String id,
    @Query('desde') required String desde,
    @Query('hasta') required String hasta,
    @Query('formato') required Formato formato,
    @Query('viviendaId') String? viviendaId,
    @Query('personaId') String? personaId,
    @Query('dispositivoId') String? dispositivoId,
    @Query('zonaId') String? zonaId,
    @Query('tipo') Tipo? tipo,
    @Query('resultado') Resultado? resultado,
    @Query('motivo') Motivo? motivo,
    @Query('tamanoPagina') num? tamanoPagina,
    @Query('cursor') String? cursor,
  });

  /// Flujo de eventos y alertas en vivo (SSE)
  @GET('/copropiedades/{id}/eventos/flujo')
  @DioResponseType(ResponseType.stream)
  Stream<String> eventosControllerFlujo({
    @Path('id') required String id,
  });

  /// URL firmada de vida corta a la evidencia (RN-21)
  @GET('/copropiedades/{id}/eventos/{eventoId}/evidencia')
  Future<UrlDeEvidenciaDto> eventosControllerUrlDeEvidencia({
    @Path('id') required String id,
    @Path('eventoId') required String eventoId,
  });
}
