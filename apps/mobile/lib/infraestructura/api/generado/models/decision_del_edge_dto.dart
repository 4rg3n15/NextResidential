// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'decision_del_edge_dto_motivo.dart';

part 'decision_del_edge_dto.g.dart';

@JsonSerializable()
class DecisionDelEdgeDto {
  const DecisionDelEdgeDto({
    required this.permitido,
    required this.reglaAplicada,
    required this.versionDeReglas,
    this.motivo,
    this.requiereConfirmacionHumana,
  });
  
  factory DecisionDelEdgeDto.fromJson(Map<String, Object?> json) => _$DecisionDelEdgeDtoFromJson(json);
  
  /// Lo que el Edge resolvió en la portería
  final bool permitido;

  /// Obligatorio cuando `permitido` es falso (CA-16)
  final DecisionDelEdgeDtoMotivo? motivo;

  /// Qué política resolvió. Es la traza de CA-21.
  final String reglaAplicada;

  /// La versión de reglas con la que decidió (RN-16)
  final num versionDeReglas;

  /// Lectura de baja confianza (CU-01 3a)
  final bool? requiereConfirmacionHumana;

  Map<String, Object?> toJson() => _$DecisionDelEdgeDtoToJson(this);
}
