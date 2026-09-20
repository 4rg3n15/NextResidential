// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rostro_capturado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RostroCapturadoDto _$RostroCapturadoDtoFromJson(Map<String, dynamic> json) =>
    RostroCapturadoDto(
      aceptada: json['aceptada'] as bool,
      motivos: (json['motivos'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      plantillaId: json['plantillaId'] as String?,
      consentimientoId: json['consentimientoId'] as String?,
      titular: json['titular'] as String?,
      calidad: json['calidad'] as num?,
    );

Map<String, dynamic> _$RostroCapturadoDtoToJson(RostroCapturadoDto instance) =>
    <String, dynamic>{
      'aceptada': instance.aceptada,
      'motivos': instance.motivos,
      'plantillaId': instance.plantillaId,
      'consentimientoId': instance.consentimientoId,
      'titular': instance.titular,
      'calidad': instance.calidad,
    };
