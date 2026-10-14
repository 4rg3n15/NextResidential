// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'actividad_por_vivienda_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ActividadPorViviendaDto _$ActividadPorViviendaDtoFromJson(
  Map<String, dynamic> json,
) => ActividadPorViviendaDto(
  criterio: json['criterio'] as String,
  ahora: DateTime.parse(json['ahora'] as String),
  filas: (json['filas'] as List<dynamic>)
      .map((e) => ActividadDeViviendaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ActividadPorViviendaDtoToJson(
  ActividadPorViviendaDto instance,
) => <String, dynamic>{
  'criterio': instance.criterio,
  'ahora': instance.ahora.toIso8601String(),
  'filas': instance.filas,
};
