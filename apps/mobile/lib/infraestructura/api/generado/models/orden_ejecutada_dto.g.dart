// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'orden_ejecutada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OrdenEjecutadaDto _$OrdenEjecutadaDtoFromJson(Map<String, dynamic> json) =>
    OrdenEjecutadaDto(
      id: json['id'] as String,
      accion: OrdenEjecutadaDtoAccion.fromJson(json['accion'] as String),
      motivo: json['motivo'] as String,
      operadorId: json['operadorId'] as String,
      rol: json['rol'] as String,
      dispositivoId: json['dispositivoId'] as String,
      momento: DateTime.parse(json['momento'] as String),
      eventoId: json['eventoId'] as String?,
      resultado: json['resultado'] == null
          ? null
          : OrdenEjecutadaDtoResultado.fromJson(json['resultado'] as String),
      detalle: json['detalle'] as String?,
    );

Map<String, dynamic> _$OrdenEjecutadaDtoToJson(OrdenEjecutadaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'accion': instance.accion,
      'motivo': instance.motivo,
      'operadorId': instance.operadorId,
      'rol': instance.rol,
      'dispositivoId': instance.dispositivoId,
      'momento': instance.momento.toIso8601String(),
      'eventoId': instance.eventoId,
      'resultado': instance.resultado,
      'detalle': instance.detalle,
    };
