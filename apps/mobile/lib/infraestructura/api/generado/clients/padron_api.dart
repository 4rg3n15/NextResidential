// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/baja_dto.dart';
import '../models/borrado_definitivo_de_vehiculo_dto.dart';
import '../models/borrado_definitivo_dto.dart';
import '../models/cargar_padron_dto.dart';
import '../models/cargar_padron_xlsx_dto.dart';
import '../models/confirmar_generacion_dto.dart';
import '../models/desactivar_dto.dart';
import '../models/edicion_aplicada_dto.dart';
import '../models/editar_vehiculo_dto.dart';
import '../models/editar_vivienda_dto.dart';
import '../models/estado.dart';
import '../models/generacion_aplicada_dto.dart';
import '../models/id_creado_dto.dart';
import '../models/pagina_de_viviendas_dto.dart';
import '../models/persona_dto.dart';
import '../models/persona_resuelta_dto.dart';
import '../models/plan_de_generacion_dto.dart';
import '../models/registrar_persona_dto.dart';
import '../models/registrar_residente_dto.dart';
import '../models/registrar_vehiculo_dto.dart';
import '../models/registrar_vivienda_dto.dart';
import '../models/resultado_de_carga_dto.dart';
import '../models/vehiculo_dto.dart';
import '../models/vista_previa_de_generacion_dto.dart';

part 'padron_api.g.dart';

@RestApi()
abstract class PadronApi {
  factory PadronApi(Dio dio, {String? baseUrl}) = _PadronApi;

  /// Carga transaccional desde CSV con reporte de errores por fila (HU-03)
  @POST('/copropiedades/{id}/padron/carga')
  Future<ResultadoDeCargaDto> padronControllerCargar({
    @Path('id') required String id,
    @Body() required CargarPadronDto body,
  });

  /// Carga transaccional desde XLSX validando el TIPO REAL del archivo (HU-03, D-20t)
  @POST('/copropiedades/{id}/padron/carga/xlsx')
  Future<ResultadoDeCargaDto> padronControllerCargarXlsx({
    @Path('id') required String id,
    @Body() required CargarPadronXlsxDto body,
  });

  /// Padrón en CSV, con las mismas columnas que acepta la carga
  @GET('/copropiedades/{id}/padron/exportacion')
  Future<String> padronControllerExportar({
    @Path('id') required String id,
  });

  /// Da de alta una persona por nombre y documento, o resuelve la que ya existe (D-72)
  @POST('/copropiedades/{id}/padron/personas')
  Future<PersonaResueltaDto> padronControllerRegistrarPersona({
    @Path('id') required String id,
    @Body() required RegistrarPersonaDto body,
  });

  /// Busca personas por nombre o documento para autorizar sin escribir un UUID (D-72).
  ///
  /// [busqueda] - Nombre parcial o documento; con menos de dos caracteres devuelve vacío.
  @GET('/copropiedades/{id}/padron/personas')
  Future<List<PersonaDto>> padronDeCopropiedadControllerPersonas({
    @Path('id') required String id,
    @Query('busqueda') required String busqueda,
  });

  /// Vincula una persona a una vivienda como residente (HU-02)
  @POST('/copropiedades/{id}/padron/residentes')
  Future<IdCreadoDto> padronControllerRegistrarResidente({
    @Path('id') required String id,
    @Body() required RegistrarResidenteDto body,
  });

  /// Registra un vehículo; la placa única activa la garantiza la base
  @POST('/copropiedades/{id}/padron/vehiculos')
  Future<IdCreadoDto> padronControllerRegistrarVehiculo({
    @Path('id') required String id,
    @Body() required RegistrarVehiculoDto body,
  });

  /// Vehículos con su vivienda y su propietario (HU-04, HU-05)
  @GET('/copropiedades/{id}/padron/vehiculos')
  Future<List<VehiculoDto>> padronDeCopropiedadControllerVehiculos({
    @Path('id') required String id,
  });

  /// Edita un vehículo; la placa única activa la garantiza la base
  @PUT('/copropiedades/{id}/padron/vehiculos/{vehiculoId}')
  Future<EdicionAplicadaDto> padronControllerEditarVehiculo({
    @Path('id') required String id,
    @Path('vehiculoId') required String vehiculoId,
    @Body() required EditarVehiculoDto body,
  });

  /// Borrado DEFINITIVO del vehículo, sólo sin historial (RN-19)
  @DELETE('/copropiedades/{id}/padron/vehiculos/{vehiculoId}')
  Future<BorradoDefinitivoDeVehiculoDto> padronControllerBorrarVehiculoDefinitivamente({
    @Path('id') required String id,
    @Path('vehiculoId') required String vehiculoId,
  });

  /// Baja lógica del vehículo; el motivo es obligatorio (RN-19)
  @POST('/copropiedades/{id}/padron/vehiculos/{vehiculoId}/desactivacion')
  Future<BajaDto> padronControllerDesactivarVehiculo({
    @Path('id') required String id,
    @Path('vehiculoId') required String vehiculoId,
    @Body() required DesactivarDto body,
  });

  /// Alta de vivienda; el identificador único activo lo garantiza la base
  @POST('/copropiedades/{id}/padron/viviendas')
  Future<IdCreadoDto> padronControllerRegistrarVivienda({
    @Path('id') required String id,
    @Body() required RegistrarViviendaDto body,
  });

  /// Directorio de viviendas con totales de activas e inactivas (HU-01, RN-13)
  @GET('/copropiedades/{id}/padron/viviendas')
  Future<PaginaDeViviendasDto> padronDeCopropiedadControllerViviendas({
    @Path('id') required String id,
    @Query('estado') Estado? estado,
    @Query('busqueda') String? busqueda,
  });

  /// Crea el padrón entero en una sentencia; el índice decide (ADR-04)
  @POST('/copropiedades/{id}/padron/viviendas/generacion')
  Future<GeneracionAplicadaDto> padronControllerGenerarViviendas({
    @Path('id') required String id,
    @Body() required ConfirmarGeneracionDto body,
  });

  /// Qué se va a crear, antes de crearlo: extremos por grupo y total
  @POST('/copropiedades/{id}/padron/viviendas/generacion/previsualizacion')
  Future<VistaPreviaDeGeneracionDto> padronControllerPrevisualizarGeneracion({
    @Path('id') required String id,
    @Body() required PlanDeGeneracionDto body,
  });

  /// Edita identificador, agrupación o dirección de la vivienda (HU-02)
  @PUT('/copropiedades/{id}/padron/viviendas/{viviendaId}')
  Future<EdicionAplicadaDto> padronControllerEditarVivienda({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
    @Body() required EditarViviendaDto body,
  });

  /// Borrado DEFINITIVO, sólo si la vivienda no tiene historial (B.2, RN-19)
  @DELETE('/copropiedades/{id}/padron/viviendas/{viviendaId}')
  Future<BorradoDefinitivoDto> padronControllerBorrarViviendaDefinitivamente({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
  });

  /// Baja lógica de la vivienda; conserva su historial (RN-19, CA-02)
  @POST('/copropiedades/{id}/padron/viviendas/{viviendaId}/desactivacion')
  Future<BajaDto> padronControllerDesactivarVivienda({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
    @Body() required DesactivarDto body,
  });

  /// Vuelve a poner en servicio una vivienda dada de baja (B.2, RN-13)
  @POST('/copropiedades/{id}/padron/viviendas/{viviendaId}/reactivacion')
  Future<BajaDto> padronControllerReactivarVivienda({
    @Path('id') required String id,
    @Path('viviendaId') required String viviendaId,
  });
}
