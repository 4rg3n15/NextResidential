// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'capacidad_de_video_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CapacidadDeVideoDto _$CapacidadDeVideoDtoFromJson(Map<String, dynamic> json) =>
    CapacidadDeVideoDto(
      estado: CapacidadDeVideoDtoEstado.fromJson(json['estado'] as String),
      codec: json['codec'] as String?,
      canal: json['canal'] as String?,
      canales: (json['canales'] as List<dynamic>?)
          ?.map((e) => CanalDeVideoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CapacidadDeVideoDtoToJson(
  CapacidadDeVideoDto instance,
) => <String, dynamic>{
  'estado': instance.estado,
  'codec': instance.codec,
  'canal': instance.canal,
  'canales': instance.canales,
};
