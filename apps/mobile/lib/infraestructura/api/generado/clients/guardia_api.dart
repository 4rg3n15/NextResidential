// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'dart:convert';
import 'dart:io';

import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/aceptado_dto.dart';
import '../models/aviso_al_residente_dto.dart';
import '../models/bloqueo_vigente_dto.dart';
import '../models/bloqueos_vigentes_dto.dart';
import '../models/cola_de_atencion_dto.dart';
import '../models/emergencia_dto.dart';
import '../models/estado_de_canal_dto.dart';
import '../models/historial_de_ordenes_dto.dart';
import '../models/orden_de_bloqueo_dto.dart';
import '../models/orden_ejecutada_dto.dart';
import '../models/orden_manual_dto.dart';
import '../models/solicitud_de_canal_dto.dart';

part 'guardia_api.g.dart';

@RestApi()
abstract class GuardiaApi {
  factory GuardiaApi(Dio dio, {String? baseUrl}) = _GuardiaApi;

  /// Avisa al residente cuando no contesta al intercom (HU-28)
  @POST('/copropiedades/{id}/guardia/avisar-residente')
  Future<AceptadoDto> guardiaControllerAvisarResidente({
    @Path('id') required String id,
    @Body() required AvisoAlResidenteDto body,
  });

  /// Bloquea o desbloquea el acceso, con motivo obligatorio (RN-08)
  @POST('/copropiedades/{id}/guardia/bloqueo')
  Future<BloqueoVigenteDto> guardiaControllerFijarBloqueo({
    @Path('id') required String id,
    @Body() required OrdenDeBloqueoDto body,
  });

  /// Accesos bloqueados de la copropiedad, con su dueño y su fecha
  @GET('/copropiedades/{id}/guardia/bloqueo')
  Future<BloqueosVigentesDto> guardiaControllerBloqueosVigentes({
    @Path('id') required String id,
  });

  /// Cola de atención con tiempo de espera (CU-03, HU-25)
  @GET('/copropiedades/{id}/guardia/cola')
  Future<ColaDeAtencionDto> guardiaControllerCola({
    @Path('id') required String id,
  });

  /// Alerta de emergencia, severidad crítica (HU-29, RN-18)
  @POST('/copropiedades/{id}/guardia/emergencia')
  Future<AceptadoDto> guardiaControllerEmergencia({
    @Path('id') required String id,
    @Body() required EmergenciaDto body,
  });

  /// Pide el canal de audio del equipo; encola si está ocupado (ADR-01)
  @POST('/copropiedades/{id}/guardia/intercom/abrir')
  Future<EstadoDeCanalDto> guardiaControllerAbrirCanal({
    @Path('id') required String id,
    @Body() required SolicitudDeCanalDto body,
  });

  /// Suelta el canal y lo cede al primero de la cola
  @POST('/copropiedades/{id}/guardia/intercom/cerrar')
  Future<EstadoDeCanalDto> guardiaControllerCerrarCanal({
    @Path('id') required String id,
    @Body() required SolicitudDeCanalDto body,
  });

  /// Estado del canal: quién tiene la palabra y cuántos esperan
  @GET('/copropiedades/{id}/guardia/intercom/{dispositivoId}')
  Future<EstadoDeCanalDto> guardiaControllerEstadoDelCanal({
    @Path('id') required String id,
    @Path('dispositivoId') required String dispositivoId,
  });

  /// Audio que el equipo emite, en flujo, para quien tiene la palabra
  @GET('/copropiedades/{id}/guardia/intercom/{dispositivoId}/audio')
  @DioResponseType(ResponseType.stream)
  Stream<String> guardiaControllerEscucharAudio({
    @Path('id') required String id,
    @Path('dispositivoId') required String dispositivoId,
  });

  /// Un trozo de audio del operador hacia el equipo
  @POST('/copropiedades/{id}/guardia/intercom/{dispositivoId}/audio')
  Future<void> guardiaControllerHablar({
    @Path('id') required String id,
    @Path('dispositivoId') required String dispositivoId,
    @Body() required File body,
  });

  /// Abre o niega a mano, con motivo obligatorio (RN-08)
  @POST('/copropiedades/{id}/guardia/ordenes')
  Future<OrdenEjecutadaDto> guardiaControllerOrdenar({
    @Path('id') required String id,
    @Body() required OrdenManualDto body,
  });

  /// Últimas órdenes manuales de la copropiedad (HU-23)
  @GET('/copropiedades/{id}/guardia/ordenes')
  Future<HistorialDeOrdenesDto> guardiaControllerHistorialDeOrdenes({
    @Path('id') required String id,
  });

  /// Negocia la vista en vivo del equipo (WHEP): oferta SDP dentro, respuesta SDP fuera
  @POST('/copropiedades/{id}/guardia/video/{dispositivoId}/whep')
  Future<String> videoControllerWhep({
    @Path('id') required String id,
    @Path('dispositivoId') required String dispositivoId,
    @Body() required String body,
  });
}
