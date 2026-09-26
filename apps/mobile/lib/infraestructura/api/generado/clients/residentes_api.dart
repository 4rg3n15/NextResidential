// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alta_de_cuenta_de_residente_dto.dart';
import '../models/anadir_ocupantes_dto.dart';
import '../models/cuenta_de_residente_creada_dto.dart';
import '../models/cuenta_de_residente_dto.dart';
import '../models/plaza_de_ocupante_dto.dart';
import '../models/plaza_retirada_dto.dart';
import '../models/retiro_de_ocupante_dto.dart';
import '../models/vehiculo_de_residente_dto.dart';

part 'residentes_api.g.dart';

@RestApi()
abstract class ResidentesApi {
  factory ResidentesApi(Dio dio, {String? baseUrl}) = _ResidentesApi;

  /// Cuentas de residentes y su vivienda (sin correo)
  @GET('/copropiedades/{id}/residentes/cuentas')
  Future<List<CuentaDeResidenteDto>> supervisionDeResidentesControllerListar({
    @Path('id') required String id,
  });

  /// Alta de un residente con usuario y contraseña inicial (3.1)
  @POST('/copropiedades/{id}/residentes/cuentas')
  Future<CuentaDeResidenteCreadaDto> supervisionDeResidentesControllerAlta({
    @Path('id') required String id,
    @Body() required AltaDeCuentaDeResidenteDto body,
  });

  /// Vehículos registrados por residentes, con fecha y vivienda (D5 a)
  @GET('/copropiedades/{id}/residentes/vehiculos')
  Future<List<VehiculoDeResidenteDto>> supervisionDeResidentesControllerVehiculos({
    @Path('id') required String id,
  });

  /// Plazas de ocupante de una vivienda, con los códigos libres (D6)
  @GET('/copropiedades/{id}/viviendas/{viviendaId}/ocupantes')
  Future<List<PlazaDeOcupanteDto>> ocupantesDeViviendaControllerVer({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
  });

  /// Añade ocupantes a petición del residente, con motivo (D6)
  @POST('/copropiedades/{id}/viviendas/{viviendaId}/ocupantes')
  Future<List<PlazaDeOcupanteDto>> ocupantesDeViviendaControllerAnadir({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
    @Body() required AnadirOcupantesDto body,
  });

  /// Quita un ocupante; si la plaza estaba ocupada, da de baja el vínculo (D6)
  @POST('/copropiedades/{id}/viviendas/{viviendaId}/ocupantes/{plazaId}/retiro')
  Future<PlazaRetiradaDto> ocupantesDeViviendaControllerRetirar({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
    @Path('plazaId') required String plazaId,
    @Body() required RetiroDeOcupanteDto body,
  });
}
