// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'definicion_kpi_dto.g.dart';

@JsonSerializable()
class DefinicionKpiDto {
  const DefinicionKpiDto({
    required this.clave,
    required this.titulo,
    required this.umbralMs,
    required this.segmento,
    required this.noIncluye,
    required this.rnf,
    this.ca,
  });
  
  factory DefinicionKpiDto.fromJson(Map<String, Object?> json) => _$DefinicionKpiDtoFromJson(json);
  
  final String clave;
  final String titulo;

  /// Techo comprometido, en milisegundos
  final num umbralMs;

  /// Dónde arranca y dónde para el cronómetro
  final String segmento;

  /// Lo que la cifra NO contiene. Se lee antes que la cifra
  final String noIncluye;
  final String rnf;
  final String? ca;

  Map<String, Object?> toJson() => _$DefinicionKpiDtoToJson(this);
}
