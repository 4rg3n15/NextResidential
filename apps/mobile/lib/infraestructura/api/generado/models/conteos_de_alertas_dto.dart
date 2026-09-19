// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conteos_de_alertas_dto_severidad_maxima.dart';

part 'conteos_de_alertas_dto.g.dart';

@JsonSerializable()
class ConteosDeAlertasDto {
  const ConteosDeAlertasDto({
    required this.pendientes,
    required this.severidadMaxima,
  });
  
  factory ConteosDeAlertasDto.fromJson(Map<String, Object?> json) => _$ConteosDeAlertasDtoFromJson(json);
  
  final num pendientes;

  /// Severidad más grave entre las pendientes; null si no hay ninguna
  final ConteosDeAlertasDtoSeveridadMaxima? severidadMaxima;

  Map<String, Object?> toJson() => _$ConteosDeAlertasDtoToJson(this);
}
