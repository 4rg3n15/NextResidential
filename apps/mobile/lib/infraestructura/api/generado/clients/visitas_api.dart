// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/estado2.dart';
import '../models/foto_en_equipo_dto.dart';
import '../models/generar_visita_dto.dart';
import '../models/lista_de_visitas_dto.dart';
import '../models/rechazo_de_visita_dto.dart';
import '../models/texto_de_la_casilla_dto.dart';
import '../models/visita_generada_dto.dart';
import '../models/visita_rechazada_dto.dart';
import '../models/vivienda_de_visita_dto.dart';

part 'visitas_api.g.dart';

@RestApi()
abstract class VisitasApi {
  factory VisitasApi(Dio dio, {String? baseUrl}) = _VisitasApi;

  /// Visitas: las del día en portería; con filtros en administración.
  ///
  /// [texto] - Nombre o documento del visitante.
  @GET('/copropiedades/{id}/visitas')
  Future<ListaDeVisitasDto> visitasControllerLista({
    @Path('id') required String id,
    @Query('desde') DateTime? desde,
    @Query('hasta') DateTime? hasta,
    @Query('viviendaId') String? viviendaId,
    @Query('estado') Estado2? estado,
    @Query('texto') String? texto,
  });

  /// Genera la autorización de un visitante con su foto (F1, F2, F3, F4)
  @POST('/copropiedades/{id}/visitas')
  Future<VisitaGeneradaDto> visitasControllerCrear({
    @Path('id') required String id,
    @Body() required GenerarVisitaDto body,
  });

  /// El texto de la casilla de consentimiento y su versión
  @GET('/copropiedades/{id}/visitas/casilla')
  Future<TextoDeLaCasillaDto> visitasControllerCasilla({
    @Path('id') required String id,
  });

  /// Las viviendas activas, para elegir a cuál va la visita
  @GET('/copropiedades/{id}/visitas/viviendas')
  Future<List<ViviendaDeVisitaDto>> visitasControllerViviendas({
    @Path('id') required String id,
  });

  /// En qué equipos está la foto de la visita, equipo por equipo (F3)
  @GET('/copropiedades/{id}/visitas/{autorizacionId}/equipos')
  Future<List<FotoEnEquipoDto>> visitasControllerEquipos({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
  });

  /// Rechaza la visita: la anula y retira la foto de los equipos (F2)
  @POST('/copropiedades/{id}/visitas/{autorizacionId}/rechazo')
  Future<VisitaRechazadaDto> visitasControllerRechazo({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
    @Body() required RechazoDeVisitaDto body,
  });
}
