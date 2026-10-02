// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'evento_del_edge_dto.dart';

part 'lote_del_edge_dto.g.dart';

@JsonSerializable()
class LoteDelEdgeDto {
  const LoteDelEdgeDto({
    required this.eventos,
  });
  
  factory LoteDelEdgeDto.fromJson(Map<String, Object?> json) => _$LoteDelEdgeDtoFromJson(json);
  
  final List<EventoDelEdgeDto> eventos;

  Map<String, Object?> toJson() => _$LoteDelEdgeDtoToJson(this);
}
