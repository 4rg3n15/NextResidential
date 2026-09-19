// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alerta_expuesta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AlertaExpuestaDto _$AlertaExpuestaDtoFromJson(Map<String, dynamic> json) =>
    AlertaExpuestaDto(
      id: json['id'] as String,
      tipo: AlertaExpuestaDtoTipo.fromJson(json['tipo'] as String),
      severidad: AlertaExpuestaDtoSeveridad.fromJson(
        json['severidad'] as String,
      ),
      estado: AlertaExpuestaDtoEstado.fromJson(json['estado'] as String),
      generadaEn: DateTime.parse(json['generadaEn'] as String),
      escaladaEn: json['escaladaEn'] == null
          ? null
          : DateTime.parse(json['escaladaEn'] as String),
      eventoId: json['eventoId'] as String?,
      dispositivoId: json['dispositivoId'] as String?,
      escaladaDentroDelPlazo: json['escaladaDentroDelPlazo'] as bool?,
      notas: json['notas'] as String?,
    );

Map<String, dynamic> _$AlertaExpuestaDtoToJson(AlertaExpuestaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'tipo': instance.tipo,
      'severidad': instance.severidad,
      'estado': instance.estado,
      'generadaEn': instance.generadaEn.toIso8601String(),
      'escaladaEn': instance.escaladaEn?.toIso8601String(),
      'eventoId': instance.eventoId,
      'dispositivoId': instance.dispositivoId,
      'escaladaDentroDelPlazo': instance.escaladaDentroDelPlazo,
      'notas': instance.notas,
    };
