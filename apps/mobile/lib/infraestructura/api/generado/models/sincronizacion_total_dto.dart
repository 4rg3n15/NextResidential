// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resultado_por_terminal_dto.dart';

part 'sincronizacion_total_dto.g.dart';

@JsonSerializable()
class SincronizacionTotalDto {
  const SincronizacionTotalDto({
    required this.plantillaId,
    required this.terminales,
    required this.sincronizadas,
    required this.fallidas,
    required this.porTerminal,
  });
  
  factory SincronizacionTotalDto.fromJson(Map<String, Object?> json) => _$SincronizacionTotalDtoFromJson(json);
  
  final String plantillaId;

  /// Equipos activos con biblioteca de rostros
  final num terminales;
  final num sincronizadas;
  final num fallidas;
  final List<ResultadoPorTerminalDto> porTerminal;

  Map<String, Object?> toJson() => _$SincronizacionTotalDtoToJson(this);
}
