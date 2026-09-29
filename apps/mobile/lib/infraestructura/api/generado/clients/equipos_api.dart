// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/alta_de_equipo_dto.dart';
import '../models/atestacion_de_equipo_dto.dart';
import '../models/atestacion_de_equipo_entrada_dto.dart';
import '../models/baja_de_equipo_dto.dart';
import '../models/baja_de_equipo_resultado_dto.dart';
import '../models/correccion_de_equipo_dto.dart';
import '../models/edicion_de_equipo_dto.dart';
import '../models/equipo_creado_dto.dart';
import '../models/equipo_dto.dart';
import '../models/equipos_dto.dart';
import '../models/estado_de_equipos_simulados_dto.dart';
import '../models/motivo_de_configuracion_dto.dart';
import '../models/nombre_de_equipo_dto.dart';
import '../models/resultado_de_configuracion_dto.dart';
import '../models/resultado_de_correccion_dto.dart';
import '../models/resultado_de_sondeo_dto.dart';
import '../models/verificacion_remota_dto.dart';

part 'equipos_api.g.dart';

@RestApi()
abstract class EquiposApi {
  factory EquiposApi(Dio dio, {String? baseUrl}) = _EquiposApi;

  /// Equipos de la copropiedad, sin credenciales
  @GET('/copropiedades/{id}/equipos')
  Future<EquiposDto> equiposControllerListar({
    @Path('id') required String id,
  });

  /// Da de alta un equipo; el secreto se guarda cifrado. Una cámara LPR recibe además su secreto de Alarm Server, que se muestra SOLO en esta respuesta
  @POST('/copropiedades/{id}/equipos')
  Future<EquipoCreadoDto> equiposControllerCrear({
    @Path('id') required String id,
    @Body() required AltaDeEquipoDto body,
  });

  /// Si las órdenes de la consola llegan a equipos reales (franja F3)
  @GET('/copropiedades/{id}/equipos-simulados')
  Future<EstadoDeEquiposSimuladosDto> equiposSimuladosControllerEstado({
    @Path('id') required String id,
  });

  /// Prueba la conexión DESDE EL SERVIDOR, sin guardar nada
  @POST('/copropiedades/{id}/equipos/prueba-de-conexion')
  Future<ResultadoDeSondeoDto> equiposControllerProbar({
    @Path('id') required String id,
    @Body() required AltaDeEquipoDto body,
  });

  /// Edita un equipo. Sin «secreto» en el cuerpo, la clave no cambia
  @PUT('/copropiedades/{id}/equipos/{equipoId}')
  Future<EquipoDto> equiposControllerEditar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required EdicionDeEquipoDto body,
  });

  /// D-11 · registra la verificación FÍSICA de una cámara: una placa de su lista blanca y una desconocida, ninguna abrió. Vale para el firmware actual del equipo
  @POST('/copropiedades/{id}/equipos/{equipoId}/atestacion')
  Future<AtestacionDeEquipoDto> atestacionesControllerAtestar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required AtestacionDeEquipoEntradaDto body,
  });

  /// Baja lógica con motivo (RN-19). Antes, retira del equipo los rostros sincronizados (RN-11); los que no pudo quitar se devuelven como pendientes
  @POST('/copropiedades/{id}/equipos/{equipoId}/baja')
  Future<BajaDeEquipoResultadoDto> equiposControllerDesactivar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required BajaDeEquipoDto body,
  });

  /// Corrige un campo del equipo. Exige confirmación y deja constancia
  @POST('/copropiedades/{id}/equipos/{equipoId}/correcciones')
  Future<ResultadoDeCorreccionDto> equiposControllerCorregir({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required CorreccionDeEquipoDto body,
  });

  /// E4 · apaga el receptor huérfano («HTTP listening») de una terminal o un videoportero, que la plataforma escucha por su flujo, y lo lee de vuelta
  @POST('/copropiedades/{id}/equipos/{equipoId}/desactivar-receptor')
  Future<ResultadoDeConfiguracionDto> configuracionEnSitioControllerDesactivarReceptor({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required MotivoDeConfiguracionDto body,
  });

  /// Sondea un equipo en servicio con su clave guardada y devuelve su ficha
  @POST('/copropiedades/{id}/equipos/{equipoId}/diagnostico')
  Future<ResultadoDeSondeoDto> equiposControllerDiagnosticar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
  });

  /// C2 · escribe en la cámara el servidor de alarmas con la IP actual del Mac, el puerto de la API y la ruta con su secreto, y lo lee de vuelta
  @POST('/copropiedades/{id}/equipos/{equipoId}/enviar-eventos-a-este-mac')
  Future<ResultadoDeConfiguracionDto> configuracionEnSitioControllerEnviarEventos({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required MotivoDeConfiguracionDto body,
  });

  /// Vuelve a poner en servicio un equipo dado de baja
  @POST('/copropiedades/{id}/equipos/{equipoId}/reactivacion')
  Future<EquipoDto> equiposControllerReactivar({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
  });

  /// F2 · activa o desactiva la verificación remota de la terminal (AcsCfg) y la lee de vuelta. Desactivarla es el plan B sin código
  @PUT('/copropiedades/{id}/equipos/{equipoId}/verificacion-remota')
  Future<ResultadoDeConfiguracionDto> configuracionEnSitioControllerCambiarVerificacion({
    @Path('id') required String id,
    @Path('equipoId') required String equipoId,
    @Body() required VerificacionRemotaDto body,
  });

  /// El nombre de cada equipo de la copropiedad, sin nada más
  @GET('/copropiedades/{id}/nombres-de-equipos')
  Future<List<NombreDeEquipoDto>> nombresDeEquiposControllerNombres({
    @Path('id') required String id,
  });
}
