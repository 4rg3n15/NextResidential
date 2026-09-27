// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'equipo_omitido_dto.dart';
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
    required this.omitidas,
  });
  
  factory SincronizacionTotalDto.fromJson(Map<String, Object?> json) => _$SincronizacionTotalDtoFromJson(json);
  
  final String plantillaId;

  /// Equipos activos con biblioteca de rostros
  final num terminales;
  final num sincronizadas;
  final num fallidas;
  final List<ResultadoPorTerminalDto> porTerminal;

  /// A3 (15-L) · terminales y videoporteros sin biblioteca de rostros: se omiten y se dice
  final List<EquipoOmitidoDto> omitidas;

  Map<String, Object?> toJson() => _$SincronizacionTotalDtoToJson(this);
}
