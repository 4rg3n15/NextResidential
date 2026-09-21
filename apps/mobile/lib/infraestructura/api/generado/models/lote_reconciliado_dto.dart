// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resultado_de_reconciliacion_dto.dart';

part 'lote_reconciliado_dto.g.dart';

@JsonSerializable()
class LoteReconciliadoDto {
  const LoteReconciliadoDto({
    required this.aceptado,
    required this.resultados,
  });
  
  factory LoteReconciliadoDto.fromJson(Map<String, Object?> json) => _$LoteReconciliadoDtoFromJson(json);
  
  final bool aceptado;

  /// Uno por evento procesado, EN ORDEN. Se corta en el primero que falla.
  final List<ResultadoDeReconciliacionDto> resultados;

  Map<String, Object?> toJson() => _$LoteReconciliadoDtoToJson(this);
}
