// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'definicion_kpi_dto.dart';

part 'fila_de_latencia_dto.g.dart';

@JsonSerializable()
class FilaDeLatenciaDto {
  const FilaDeLatenciaDto({
    required this.definicion,
    required this.muestras,
    required this.observadas,
    required this.incumplimientos,
    this.p50,
    this.p95,
    this.p99,
    this.maximo,
    this.cumple,
  });
  
  factory FilaDeLatenciaDto.fromJson(Map<String, Object?> json) => _$FilaDeLatenciaDtoFromJson(json);
  
  final DefinicionKpiDto definicion;

  /// Muestras dentro de la ventana deslizante
  final num muestras;

  /// Observaciones desde el arranque; no las borra la ventana
  final num observadas;

  /// Muestras por encima del umbral desde el arranque
  final num incumplimientos;
  final num? p50;
  final num? p95;
  final num? p99;
  final num? maximo;

  /// `null` significa SIN MUESTRAS, que no es lo mismo que incumplir
  final bool? cumple;

  Map<String, Object?> toJson() => _$FilaDeLatenciaDtoToJson(this);
}
