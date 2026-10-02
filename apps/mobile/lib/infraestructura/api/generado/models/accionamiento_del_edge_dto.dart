// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'accionamiento_del_edge_dto_estado.dart';
import 'accionamiento_del_edge_dto_tipo.dart';

part 'accionamiento_del_edge_dto.g.dart';

@JsonSerializable()
class AccionamientoDelEdgeDto {
  const AccionamientoDelEdgeDto({
    required this.tipo,
    required this.estado,
    required this.latenciaMs,
    required this.ocurridoEn,
    this.motivo,
  });
  
  factory AccionamientoDelEdgeDto.fromJson(Map<String, Object?> json) => _$AccionamientoDelEdgeDtoFromJson(json);
  
  final AccionamientoDelEdgeDtoTipo tipo;
  final AccionamientoDelEdgeDtoEstado estado;
  final num latenciaMs;
  final String? motivo;

  /// Cuándo se accionó, en el reloj del Edge
  final String ocurridoEn;

  Map<String, Object?> toJson() => _$AccionamientoDelEdgeDtoToJson(this);
}
