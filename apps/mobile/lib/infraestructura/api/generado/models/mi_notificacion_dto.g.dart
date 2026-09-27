// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_notificacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiNotificacionDto _$MiNotificacionDtoFromJson(Map<String, dynamic> json) =>
    MiNotificacionDto(
      id: json['id'] as String,
      tipo: MiNotificacionDtoTipo.fromJson(json['tipo'] as String),
      en: DateTime.parse(json['en'] as String),
      visitante: json['visitante'] as String?,
      motivo: json['motivo'] as String?,
      autorizacionId: json['autorizacionId'] as String?,
    );

Map<String, dynamic> _$MiNotificacionDtoToJson(MiNotificacionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'tipo': instance.tipo,
      'en': instance.en.toIso8601String(),
      'visitante': instance.visitante,
      'motivo': instance.motivo,
      'autorizacionId': instance.autorizacionId,
    };
