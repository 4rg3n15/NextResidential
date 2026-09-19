// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'listo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListoDto _$ListoDtoFromJson(Map<String, dynamic> json) => ListoDto(
  estado: json['estado'] as String,
  dependencias: Map<String, String>.from(json['dependencias'] as Map),
);

Map<String, dynamic> _$ListoDtoToJson(ListoDto instance) => <String, dynamic>{
  'estado': instance.estado,
  'dependencias': instance.dependencias,
};
