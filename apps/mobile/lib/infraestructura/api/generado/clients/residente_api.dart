// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alta_de_mi_vivienda_dto.dart';
import '../models/aparato_registrado_dto.dart';
import '../models/declaracion_de_ocupantes_dto.dart';
import '../models/estado_de_consentimiento_dto.dart';
import '../models/estado_de_mi_alta_dto.dart';
import '../models/mi_autorizacion_dto.dart';
import '../models/mi_evento_dto.dart';
import '../models/mi_inicio_dto.dart';
import '../models/mi_vehiculo_dto.dart';
import '../models/mi_zona_dto.dart';
import '../models/miembro_de_familia_dto.dart';
import '../models/mis_ocupantes_dto.dart';
import '../models/nueva_visita_dto.dart';
import '../models/perfil_del_residente_dto.dart';
import '../models/perfil_dto.dart';
import '../models/periodo.dart';
import '../models/resultado_de_alta_dto.dart';
import '../models/resultado_de_perfil_dto.dart';
import '../models/resultado_de_vehiculo_propio_dto.dart';
import '../models/rostro_capturado_dto.dart';
import '../models/rostro_de_mi_visitante_dto.dart';
import '../models/token_de_notificacion_dto.dart';
import '../models/vehiculo_desactivado_dto.dart';
import '../models/vehiculo_propio_dto.dart';
import '../models/visita_creada_dto.dart';

part 'residente_api.g.dart';

@RestApi()
abstract class ResidenteApi {
  factory ResidenteApi(Dio dio, {String? baseUrl}) = _ResidenteApi;

  /// Qué le falta al residente para operar: vivienda y ocupantes (3.2)
  @GET('/copropiedades/{id}/mi/alta')
  Future<EstadoDeMiAltaDto> miAltaControllerEstado({
    @Path('id') required String id,
  });

  /// Primer ingreso: contacto, documento, vivienda y código (3.2)
  @POST('/copropiedades/{id}/mi/alta')
  Future<ResultadoDeAltaDto> miAltaControllerAlta({
    @Path('id') required String id,
    @Body() required AltaDeMiViviendaDto body,
  });

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

  /// ¿Respondió mi visitante? pendiente, aceptado o rechazado (RN-10)
  @GET('/copropiedades/{id}/mi/autorizaciones/{autorizacionId}/consentimientos/{consentimientoId}')
  Future<EstadoDeConsentimientoDto> miHogarControllerEstadoDelConsentimiento({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
    @Path('consentimientoId') required String consentimientoId,
  });

  /// Capturo el rostro de mi visitante; el consentimiento se le pide A ÉL (RN-10)
  @POST('/copropiedades/{id}/mi/autorizaciones/{autorizacionId}/rostro')
  Future<RostroCapturadoDto> miControllerCapturarRostro({
    @Path('id') required String id,
    @Path('autorizacionId') required String autorizacionId,
    @Body() required RostroDeMiVisitanteDto body,
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

  /// Mis ocupantes y los códigos de las plazas libres (3.3)
  @GET('/copropiedades/{id}/mi/ocupantes')
  Future<MisOcupantesDto> miAltaControllerOcupantes({
    @Path('id') required String id,
  });

  /// Declaro cuántos ocupantes hay: una vez y definitivo (D6)
  @POST('/copropiedades/{id}/mi/ocupantes')
  Future<MisOcupantesDto> miAltaControllerDeclararOcupantes({
    @Path('id') required String id,
    @Body() required DeclaracionDeOcupantesDto body,
  });

  /// Mi perfil, mi copropiedad y el teléfono de portería (3.5, D7)
  @GET('/copropiedades/{id}/mi/perfil')
  Future<PerfilDelResidenteDto> miHogarControllerPerfil({
    @Path('id') required String id,
  });

  /// Edito mis datos personales y de contacto (3.5)
  @PUT('/copropiedades/{id}/mi/perfil')
  Future<ResultadoDePerfilDto> miHogarControllerEditar({
    @Path('id') required String id,
    @Body() required PerfilDto body,
  });

  /// Los vehículos de mi vivienda (HU-05, HU-06 lectura, M-3)
  @GET('/copropiedades/{id}/mi/vehiculos')
  Future<List<MiVehiculoDto>> miControllerVehiculos({
    @Path('id') required String id,
  });

  /// Registro un vehículo propio: activo al instante, dentro del tope (D5 a)
  @POST('/copropiedades/{id}/mi/vehiculos')
  Future<ResultadoDeVehiculoPropioDto> miHogarControllerVehiculo({
    @Path('id') required String id,
    @Body() required VehiculoPropioDto body,
  });

  /// Doy de baja un vehículo propio de mi vivienda; libera el cupo
  @POST('/copropiedades/{id}/mi/vehiculos/{vehiculoId}/desactivacion')
  Future<VehiculoDesactivadoDto> miHogarControllerDesactivar({
    @Path('id') required String id,
    @Path('vehiculoId') required String vehiculoId,
  });

  /// Cambio de vivienda desde el perfil: siempre con código (3.5)
  @POST('/copropiedades/{id}/mi/vinculacion')
  Future<ResultadoDeAltaDto> miAltaControllerCambioDeVivienda({
    @Path('id') required String id,
    @Body() required AltaDeMiViviendaDto body,
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
