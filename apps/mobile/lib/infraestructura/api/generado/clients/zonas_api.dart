// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/autorizar_zona_dto.dart';
import '../models/configurar_zona_dto.dart';
import '../models/conteo_dto.dart';
import '../models/permiso_de_zona_dto.dart';
import '../models/veredicto_de_ingreso_dto.dart';
import '../models/zona_dto.dart';

part 'zonas_api.g.dart';

@RestApi()
abstract class ZonasApi {
  factory ZonasApi(Dio dio, {String? baseUrl}) = _ZonasApi;

  /// Zonas con su aforo y su disponibilidad de ahora mismo (HU-19)
  @GET('/copropiedades/{id}/zonas')
  Future<List<ZonaDto>> zonasControllerListar({
    @Path('id') required String id,
  });

  /// Da permiso sobre la zona a una autorización (HU-19, HU-20)
  @POST('/copropiedades/{id}/zonas/{zonaId}/autorizaciones')
  Future<PermisoDeZonaDto> zonasControllerPermiso({
    @Path('id') required String id,
    @Path('zonaId') required String zonaId,
    @Body() required AutorizarZonaDto body,
  });

  /// Configura horario, aforo, normas y apertura de la zona (HU-18)
  @POST('/copropiedades/{id}/zonas/{zonaId}/configuracion')
  Future<ZonaDto> zonasControllerConfiguracion({
    @Path('id') required String id,
    @Path('zonaId') required String zonaId,
    @Body() required ConfigurarZonaDto body,
  });

  /// Ocupa una plaza; el aforo lo garantiza la base (CU-05, CA-14, CA-15)
  @POST('/copropiedades/{id}/zonas/{zonaId}/ingresos')
  Future<VeredictoDeIngresoDto> zonasControllerIngreso({
    @Path('id') required String id,
    @Path('zonaId') required String zonaId,
  });

  /// Libera una plaza; nunca baja de cero (CU-05 6a)
  @POST('/copropiedades/{id}/zonas/{zonaId}/salidas')
  Future<ConteoDto> zonasControllerSalida({
    @Path('id') required String id,
    @Path('zonaId') required String zonaId,
  });
}
