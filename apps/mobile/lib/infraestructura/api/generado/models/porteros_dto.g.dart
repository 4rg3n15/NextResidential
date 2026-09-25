// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'porteros_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PorterosDto _$PorterosDtoFromJson(Map<String, dynamic> json) => PorterosDto(
  porteros: (json['porteros'] as List<dynamic>)
      .map((e) => PorteroDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PorterosDtoToJson(PorterosDto instance) =>
    <String, dynamic>{'porteros': instance.porteros};
