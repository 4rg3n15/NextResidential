// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'evento_reconciliado_dto.dart';

part 'lote_de_reconciliacion_dto.g.dart';

@JsonSerializable()
class LoteDeReconciliacionDto {
  const LoteDeReconciliacionDto({
    required this.eventos,
  });
  
  factory LoteDeReconciliacionDto.fromJson(Map<String, Object?> json) => _$LoteDeReconciliacionDtoFromJson(json);
  
  final List<EventoReconciliadoDto> eventos;

  Map<String, Object?> toJson() => _$LoteDeReconciliacionDtoToJson(this);
}
