// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alta_de_cuenta_de_residente_dto.dart';
import '../models/anadir_ocupantes_dto.dart';
import '../models/asignacion_de_vivienda_dto.dart';
import '../models/baja_de_residente_dto.dart';
import '../models/cambio_de_tope_de_plazas_dto.dart';
import '../models/cambio_de_tope_por_omision_dto.dart';
import '../models/cuenta_dada_de_baja_dto.dart';
import '../models/cuenta_de_residente_creada_dto.dart';
import '../models/cuenta_de_residente_dto.dart';
import '../models/estado_del_registro_dto.dart';
import '../models/perfil_del_residente_dto.dart';
import '../models/perfil_dto.dart';
import '../models/plaza_de_ocupante_dto.dart';
import '../models/plaza_retirada_dto.dart';
import '../models/reanudacion_del_registro_dto.dart';
import '../models/registro_reanudado_dto.dart';
import '../models/resultado_de_perfil_dto.dart';
import '../models/retiro_de_ocupante_dto.dart';
import '../models/tope_de_plazas_dto.dart';
import '../models/tope_por_omision_dto.dart';
import '../models/vehiculo_de_residente_dto.dart';
import '../models/vivienda_asignada_dto.dart';
import '../models/vivienda_sin_titular_dto.dart';

part 'residentes_api.g.dart';

@RestApi()
abstract class ResidentesApi {
  factory ResidentesApi(Dio dio, {String? baseUrl}) = _ResidentesApi;

  /// Cuentas de residentes y su vivienda (sin correo)
  @GET('/copropiedades/{id}/residentes/cuentas')
  Future<List<CuentaDeResidenteDto>> supervisionDeResidentesControllerListar({
    @Path('id') required String id,
  });

  /// Alta del TITULAR de una vivienda, con contraseña inicial y su vivienda (D1, D-W9)
  @POST('/copropiedades/{id}/residentes/cuentas')
  Future<CuentaDeResidenteCreadaDto> supervisionDeResidentesControllerAlta({
    @Path('id') required String id,
    @Body() required AltaDeCuentaDeResidenteDto body,
  });

  /// Da de baja a un residente con motivo; nunca borrado físico (RN-19)
  @POST('/copropiedades/{id}/residentes/cuentas/{usuarioId}/baja')
  Future<CuentaDadaDeBajaDto> supervisionDeResidentesControllerBaja({
    @Path('id') required String id,
    @Path('usuarioId') required String usuarioId,
    @Body() required BajaDeResidenteDto body,
  });

  /// Perfil de un residente (datos personales y de contacto)
  @GET('/copropiedades/{id}/residentes/cuentas/{usuarioId}/perfil')
  Future<PerfilDelResidenteDto> perfilDeResidentesControllerVer({
    @Path('id') required String id,
    @Path('usuarioId') required String usuarioId,
  });

  /// Edita el perfil de un residente; queda en su bitácora con el autor
  @PUT('/copropiedades/{id}/residentes/cuentas/{usuarioId}/perfil')
  Future<ResultadoDePerfilDto> perfilDeResidentesControllerEditar({
    @Path('id') required String id,
    @Path('usuarioId') required String usuarioId,
    @Body() required PerfilDto body,
  });

  /// Asigna su vivienda a una cuenta antigua, como titular (D1)
  @POST('/copropiedades/{id}/residentes/cuentas/{usuarioId}/vivienda')
  Future<ViviendaAsignadaDto> supervisionDeResidentesControllerAsignarVivienda({
    @Path('id') required String id,
    @Path('usuarioId') required String usuarioId,
    @Body() required AsignacionDeViviendaDto body,
  });

  /// ¿Está suspendido «Crear cuenta» por intentos? (§7)
  @GET('/copropiedades/{id}/residentes/registro')
  Future<EstadoDelRegistroDto> registroDeLaCopropiedadControllerEstado({
    @Path('id') required String id,
  });

  /// Reanuda «Crear cuenta» antes de la hora, con motivo (§7)
  @POST('/copropiedades/{id}/residentes/registro/reanudacion')
  Future<RegistroReanudadoDto> registroDeLaCopropiedadControllerReanudar({
    @Path('id') required String id,
    @Body() required ReanudacionDelRegistroDto body,
  });

  /// Vehículos registrados por residentes, con fecha y vivienda (D5 a)
  @GET('/copropiedades/{id}/residentes/vehiculos')
  Future<List<VehiculoDeResidenteDto>> supervisionDeResidentesControllerVehiculos({
    @Path('id') required String id,
  });

  /// Viviendas activas sin titular, por número o agrupación (D1).
  ///
  /// [q] - Número o agrupación; vacío = todas (50 como máximo).
  @GET('/copropiedades/{id}/residentes/viviendas-sin-titular')
  Future<List<ViviendaSinTitularDto>> supervisionDeResidentesControllerViviendasSinTitular({
    @Path('id') required String id,
    @Query('q') String? q,
  });

  /// Tope de plazas por vivienda de la copropiedad (D-W10)
  @GET('/copropiedades/{id}/tope-de-plazas')
  Future<TopePorOmisionDto> topeDePlazasPorOmisionControllerVer({
    @Path('id') required String id,
  });

  /// Cambia el tope por omisión; nadie pierde plazas si baja (D-W10)
  @PUT('/copropiedades/{id}/tope-de-plazas')
  Future<TopePorOmisionDto> topeDePlazasPorOmisionControllerCambiar({
    @Path('id') required String id,
    @Body() required CambioDeTopePorOmisionDto body,
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

  /// Plazas activas y tope de la vivienda (D-W10)
  @GET('/copropiedades/{id}/viviendas/{viviendaId}/tope-de-plazas')
  Future<TopeDePlazasDto> topeDePlazasControllerVer({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
  });

  /// Cambia el tope de plazas de la vivienda, con motivo (D-W10)
  @PUT('/copropiedades/{id}/viviendas/{viviendaId}/tope-de-plazas')
  Future<TopeDePlazasDto> topeDePlazasControllerCambiar({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
    @Body() required CambioDeTopeDePlazasDto body,
  });
}
