// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'listo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListoDto _$ListoDtoFromJson(Map<String, dynamic> json) => ListoDto(
  estado: json['estado'] as String,
  dependencias: Map<String, String>.from(json['dependencias'] as Map),
  motivos: (json['motivos'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  avisos: (json['avisos'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
);

Map<String, dynamic> _$ListoDtoToJson(ListoDto instance) => <String, dynamic>{
  'estado': instance.estado,
  'dependencias': instance.dependencias,
  'motivos': instance.motivos,
  'avisos': instance.avisos,
};
