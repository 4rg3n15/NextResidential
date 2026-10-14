// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'actividad_de_vivienda_dto.g.dart';

@JsonSerializable()
class ActividadDeViviendaDto {
  const ActividadDeViviendaDto({
    required this.viviendaId,
    required this.identificador,
    required this.agrupacion,
    required this.vehiculosEnVisita,
    required this.visitantesAhora,
  });
  
  factory ActividadDeViviendaDto.fromJson(Map<String, Object?> json) => _$ActividadDeViviendaDtoFromJson(json);
  
  final String viviendaId;
  final String identificador;
  final String? agrupacion;

  /// Vehículos en visita activa en esta vivienda.
  final num vehiculosEnVisita;

  /// Visitantes dentro en este momento, según el criterio.
  final num visitantesAhora;

  Map<String, Object?> toJson() => _$ActividadDeViviendaDtoToJson(this);
}
