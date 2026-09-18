// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'salud_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaludDto _$SaludDtoFromJson(Map<String, dynamic> json) => SaludDto(
  estado: json['estado'] as String,
  momento: DateTime.parse(json['momento'] as String),
);

Map<String, dynamic> _$SaludDtoToJson(SaludDto instance) => <String, dynamic>{
  'estado': instance.estado,
  'momento': instance.momento.toIso8601String(),
};
