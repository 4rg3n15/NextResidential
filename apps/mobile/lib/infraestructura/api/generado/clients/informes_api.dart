// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/descarga_de_respaldo_dto.dart';
import '../models/informe_dto.dart';
import '../models/parte_del_respaldo_dto.dart';
import '../models/respaldo_diario_dto.dart';
import '../models/tipo3.dart';

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
    @Query('tipo') Tipo3? tipo,
    @Query('viviendaId') String? viviendaId,
    @Query('dispositivoId') String? dispositivoId,
  });

  /// Respaldos diarios de los eventos, del más reciente al más antiguo
  @GET('/copropiedades/{id}/respaldos')
  Future<List<RespaldoDiarioDto>> respaldosControllerListar({
    @Path('id') required String id,
  });

  /// Ejecuta el respaldo de esta copropiedad a mano (idempotente; superadministración)
  @POST('/copropiedades/{id}/respaldos/ejecucion')
  Future<ParteDelRespaldoDto> respaldosControllerEjecutar({
    @Path('id') required String id,
  });

  /// URL firmada de vida corta para descargar el respaldo de un día
  @GET('/copropiedades/{id}/respaldos/{fecha}/descarga')
  Future<DescargaDeRespaldoDto> respaldosControllerDescargar({
    @Path('id') required String id,
    @Path('fecha') required String fecha,
  });
}
