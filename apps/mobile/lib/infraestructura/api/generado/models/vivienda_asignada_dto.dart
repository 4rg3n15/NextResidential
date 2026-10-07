// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vivienda_asignada_dto.g.dart';

@JsonSerializable()
class ViviendaAsignadaDto {
  const ViviendaAsignadaDto({
    required this.asignada,
  });
  
  factory ViviendaAsignadaDto.fromJson(Map<String, Object?> json) => _$ViviendaAsignadaDtoFromJson(json);
  
  /// Siempre true
  final bool asignada;

  Map<String, Object?> toJson() => _$ViviendaAsignadaDtoToJson(this);
}
