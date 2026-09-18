// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'punto_de_frecuencia_dto.g.dart';

@JsonSerializable()
class PuntoDeFrecuenciaDto {
  const PuntoDeFrecuenciaDto({
    required this.semana,
    required this.total,
  });
  
  factory PuntoDeFrecuenciaDto.fromJson(Map<String, Object?> json) => _$PuntoDeFrecuenciaDtoFromJson(json);
  
  /// Lunes de la semana ISO, YYYY-MM-DD
  final String semana;
  final num total;

  Map<String, Object?> toJson() => _$PuntoDeFrecuenciaDtoToJson(this);
}
