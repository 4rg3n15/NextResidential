// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alta_de_edge_dto.dart';
import '../models/credencial_del_edge_dto.dart';
import '../models/get_copropiedades_id_reglas_instantanea_response_sealed.dart';
import '../models/lote_del_edge_dto.dart';
import '../models/lote_reconciliado_dto.dart';

part 'edge_api.g.dart';

@RestApi()
abstract class EdgeApi {
  factory EdgeApi(Dio dio, {String? baseUrl}) = _EdgeApi;

  /// Da de alta un Edge Gateway y entrega su credencial (una vez)
  @POST('/copropiedades/{id}/edge-gateways')
  Future<CredencialDelEdgeDto> gatewaysControllerRegistrar({
    @Path('id') required String id,
    @Body() required AltaDeEdgeDto body,
  });

  /// Rota la credencial del Edge: la anterior deja de valer ya
  @POST('/copropiedades/{id}/edge-gateways/{edgeId}/credencial')
  Future<CredencialDelEdgeDto> gatewaysControllerRotar({
    @Path('id') required String id,
    @Path('edgeId') required String edgeId,
  });

  /// La bandeja del Edge tras un corte de WAN, con lo que hizo con cada equipo.
  ///
  /// NO vuelve a decidir (RN-16, CA-21). Cada evento debe ser de la copropiedad del Edge; uno solo de otra rechaza el lote entero (RN-15). Duplicados: 202 (RN-17, CA-22).
  @POST('/copropiedades/{id}/edge/reconciliacion')
  Future<LoteReconciliadoDto> edgeControllerReconciliar({
    @Body() required LoteDelEdgeDto body,
  });

  /// La instantánea de reglas de SU copropiedad, si hay una más nueva que `desde`.
  ///
  /// Sólo para el Edge acreditado (firma con su credencial). Sin plantillas biométricas: sólo identificadores. RN-15, RN-16, CA-21, KPI-31.
  ///
  /// [desde] - La versión que el Edge ya tiene. 0 (o ausente): no tiene ninguna.
  @GET('/copropiedades/{id}/reglas/instantanea')
  Future<GetCopropiedadesIdReglasInstantaneaResponseSealed> edgeControllerInstantanea({
    @Query('desde') num? desde,
  });
}
