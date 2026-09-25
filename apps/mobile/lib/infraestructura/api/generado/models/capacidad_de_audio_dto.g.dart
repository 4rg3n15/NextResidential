// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'capacidad_de_audio_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CapacidadDeAudioDto _$CapacidadDeAudioDtoFromJson(Map<String, dynamic> json) =>
    CapacidadDeAudioDto(
      estado: CapacidadDeAudioDtoEstado.fromJson(json['estado'] as String),
      canal: json['canal'] as num?,
      formato: json['formato'] as String?,
    );

Map<String, dynamic> _$CapacidadDeAudioDtoToJson(
  CapacidadDeAudioDto instance,
) => <String, dynamic>{
  'estado': instance.estado,
  'canal': instance.canal,
  'formato': instance.formato,
};
