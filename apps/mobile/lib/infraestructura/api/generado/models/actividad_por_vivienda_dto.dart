// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'actividad_de_vivienda_dto.dart';

part 'actividad_por_vivienda_dto.g.dart';

@JsonSerializable()
class ActividadPorViviendaDto {
  const ActividadPorViviendaDto({
    required this.criterio,
    required this.ahora,
    required this.filas,
  });
  
  factory ActividadPorViviendaDto.fromJson(Map<String, Object?> json) => _$ActividadPorViviendaDtoFromJson(json);
  
  /// Qué significa «en este momento» con los datos que hay (P-41). La pantalla lo enseña tal cual.
  final String criterio;

  /// El instante con que se juzgó.
  final DateTime ahora;

  /// Todas las viviendas activas, ordenadas por actividad.
  final List<ActividadDeViviendaDto> filas;

  Map<String, Object?> toJson() => _$ActividadPorViviendaDtoToJson(this);
}
