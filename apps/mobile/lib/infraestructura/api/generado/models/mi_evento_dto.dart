// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mi_evento_dto.g.dart';

@JsonSerializable()
class MiEventoDto {
  const MiEventoDto({
    required this.id,
    required this.ocurridoEn,
    required this.tipo,
    required this.resultado,
    required this.motivo,
    required this.metodo,
    required this.placaDetectada,
    required this.persona,
    required this.zona,
    required this.decididoPorEdge,
  });
  
  factory MiEventoDto.fromJson(Map<String, Object?> json) => _$MiEventoDtoFromJson(json);
  
  final String id;
  final DateTime ocurridoEn;
  final String tipo;
  final String? resultado;

  /// El residente tiene derecho a entender la negación (mockup M-6).
  final String? motivo;
  final String metodo;
  final String? placaDetectada;
  final String? persona;
  final String? zona;

  /// KPI-31 · decidido por el Edge: la app lo marca, no lo esconde.
  final bool decididoPorEdge;

  Map<String, Object?> toJson() => _$MiEventoDtoToJson(this);
}
