// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'equipos_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EquiposDto _$EquiposDtoFromJson(Map<String, dynamic> json) => EquiposDto(
  equipos: (json['equipos'] as List<dynamic>)
      .map((e) => EquipoDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$EquiposDtoToJson(EquiposDto instance) =>
    <String, dynamic>{'equipos': instance.equipos};
