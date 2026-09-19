// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'en_atencion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EnAtencionDto _$EnAtencionDtoFromJson(Map<String, dynamic> json) =>
    EnAtencionDto(
      eventoId: json['eventoId'] as String,
      ocurridoEn: DateTime.parse(json['ocurridoEn'] as String),
      motivo: json['motivo'] as String?,
      resultado: json['resultado'] as String,
      dispositivoId: json['dispositivoId'] as String,
      viviendaId: json['viviendaId'] as String?,
      placaDetectada: json['placaDetectada'] as String?,
      esperaSegundos: json['esperaSegundos'] as num,
      urgencia: EnAtencionDtoUrgencia.fromJson(json['urgencia'] as String),
      demorado: json['demorado'] as bool,
    );

Map<String, dynamic> _$EnAtencionDtoToJson(EnAtencionDto instance) =>
    <String, dynamic>{
      'eventoId': instance.eventoId,
      'ocurridoEn': instance.ocurridoEn.toIso8601String(),
      'motivo': instance.motivo,
      'resultado': instance.resultado,
      'dispositivoId': instance.dispositivoId,
      'viviendaId': instance.viviendaId,
      'placaDetectada': instance.placaDetectada,
      'esperaSegundos': instance.esperaSegundos,
      'urgencia': instance.urgencia,
      'demorado': instance.demorado,
    };
