// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/id_veto_dto.dart';
import '../models/veto_dto.dart';
import '../models/veto_levantado_dto.dart';
import '../models/veto_listado_dto.dart';

part 'listas_negras_api.g.dart';

@RestApi()
abstract class ListasNegrasApi {
  factory ListasNegrasApi(Dio dio, {String? baseUrl}) = _ListasNegrasApi;

  /// Vetos activos de la copropiedad (HU-35)
  @GET('/copropiedades/{id}/listas-negras')
  Future<List<VetoListadoDto>> listasNegrasControllerListar({
    @Path('id') required String id,
  });

  /// Veta una placa o una persona por su documento, con motivo (RN-06, RN-07)
  @POST('/copropiedades/{id}/listas-negras')
  Future<IdVetoDto> listasNegrasControllerCrear({
    @Path('id') required String id,
    @Body() required VetoDto body,
  });

  /// Levanta un veto: sólo la administración, con autor y momento (RN-07)
  @POST('/copropiedades/{id}/listas-negras/{vetoId}/levantamiento')
  Future<VetoLevantadoDto> listasNegrasControllerLevantarVeto({
    @Path('id') required String id,
    @Path('vetoId') required String vetoId,
  });
}
