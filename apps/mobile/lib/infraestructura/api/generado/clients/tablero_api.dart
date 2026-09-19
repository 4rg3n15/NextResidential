// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/accesos_por_hora_dto.dart';
import '../models/estado_de_dispositivos_dto.dart';
import '../models/indicadores_dto.dart';

part 'tablero_api.g.dart';

@RestApi()
abstract class TableroApi {
  factory TableroApi(Dio dio, {String? baseUrl}) = _TableroApi;

  /// Histograma de accesos del día en la zona de la copropiedad
  @GET('/copropiedades/{id}/tablero/accesos-por-hora')
  Future<AccesosPorHoraDto> tableroControllerLeerAccesosPorHora({
    @Path('id') required String id,
  });

  /// Estado en línea de los dispositivos por su latido (CA-26, RN-12)
  @GET('/copropiedades/{id}/tablero/dispositivos')
  Future<EstadoDeDispositivosDto> tableroControllerLeerDispositivos({
    @Path('id') required String id,
  });

  /// Las cuatro tarjetas de indicadores del tablero (HU-38)
  @GET('/copropiedades/{id}/tablero/indicadores')
  Future<IndicadoresDto> tableroControllerLeerIndicadores({
    @Path('id') required String id,
  });
}
