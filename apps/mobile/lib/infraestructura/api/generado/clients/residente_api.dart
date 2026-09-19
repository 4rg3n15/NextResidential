// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/aparato_registrado_dto.dart';
import '../models/mi_autorizacion_dto.dart';
import '../models/mi_evento_dto.dart';
import '../models/mi_inicio_dto.dart';
import '../models/mi_vehiculo_dto.dart';
import '../models/mi_zona_dto.dart';
import '../models/miembro_de_familia_dto.dart';
import '../models/nueva_visita_dto.dart';
import '../models/periodo.dart';
import '../models/token_de_notificacion_dto.dart';
import '../models/visita_creada_dto.dart';

part 'residente_api.g.dart';

@RestApi()
abstract class ResidenteApi {
  factory ResidenteApi(Dio dio, {String? baseUrl}) = _ResidenteApi;

  /// Las autorizaciones de mi vivienda (HU-07 lectura, M-1)
  @GET('/copropiedades/{id}/mi/autorizaciones')
  Future<List<MiAutorizacionDto>> miControllerAutorizaciones({
    @Path('id') required String id,
  });

  /// Autorizo a un visitante de mi vivienda (HU-07, HU-08, HU-09, M-4)
  @POST('/copropiedades/{id}/mi/autorizaciones')
  Future<VisitaCreadaDto> miControllerCrearAutorizacion({
    @Path('id') required String id,
    @Body() required NuevaVisitaDto body,
  });

  /// Los residentes de mi vivienda (HU-02 lectura, M-2)
  @GET('/copropiedades/{id}/mi/familia')
  Future<List<MiembroDeFamiliaDto>> miControllerFamilia({
    @Path('id') required String id,
  });

  /// El historial de mi vivienda, con los filtros del mockup (HU-33, M-6)
  @GET('/copropiedades/{id}/mi/historial')
  Future<List<MiEventoDto>> miControllerHistorial({
    @Path('id') required String id,
    @Query('periodo') Periodo? periodo = Periodo.mes,
    @Query('limite') num? limite = 50,
  });

  /// Registro este aparato para recibir notificaciones (HU-34, M-7)
  @POST('/copropiedades/{id}/mi/notificaciones/aparatos')
  Future<AparatoRegistradoDto> miControllerRegistrarAparato({
    @Path('id') required String id,
    @Body() required TokenDeNotificacionDto body,
  });

  /// Los vehículos de mi vivienda (HU-05, HU-06 lectura, M-3)
  @GET('/copropiedades/{id}/mi/vehiculos')
  Future<List<MiVehiculoDto>> miControllerVehiculos({
    @Path('id') required String id,
  });

  /// Mi vivienda, mi vínculo y si puedo autorizar (HU-33, M-1)
  @GET('/copropiedades/{id}/mi/vivienda')
  Future<MiInicioDto> miControllerVivienda({
    @Path('id') required String id,
  });

  /// Zonas comunes con aforo y horario en vivo (HU-19, M-5)
  @GET('/copropiedades/{id}/mi/zonas')
  Future<List<MiZonaDto>> miControllerZonas({
    @Path('id') required String id,
  });
}
