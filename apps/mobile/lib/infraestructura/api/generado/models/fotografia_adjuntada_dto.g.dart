// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fotografia_adjuntada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FotografiaAdjuntadaDto _$FotografiaAdjuntadaDtoFromJson(
  Map<String, dynamic> json,
) => FotografiaAdjuntadaDto(
  adjuntada: json['adjuntada'] as bool,
  tipoMime: json['tipoMime'] as String,
  tamanoBytes: json['tamanoBytes'] as num,
);

Map<String, dynamic> _$FotografiaAdjuntadaDtoToJson(
  FotografiaAdjuntadaDto instance,
) => <String, dynamic>{
  'adjuntada': instance.adjuntada,
  'tipoMime': instance.tipoMime,
  'tamanoBytes': instance.tamanoBytes,
};
