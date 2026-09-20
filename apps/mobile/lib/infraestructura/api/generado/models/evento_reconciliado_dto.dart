// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'decision_del_edge_dto.dart';
import 'evento_reconciliado_dto_metodo.dart';

part 'evento_reconciliado_dto.g.dart';

@JsonSerializable()
class EventoReconciliadoDto {
  const EventoReconciliadoDto({
    required this.copropiedadId,
    required this.dispositivoId,
    required this.metodo,
    required this.confianzaCentesimas,
    required this.referenciaExterna,
    required this.ocurridoEn,
    required this.decision,
    this.personaId,
    this.placaLeida,
    this.zonaId,
    this.cachePotencialmenteObsoleto,
  });
  
  factory EventoReconciliadoDto.fromJson(Map<String, Object?> json) => _$EventoReconciliadoDtoFromJson(json);
  
  final String copropiedadId;
  final String dispositivoId;
  final EventoReconciliadoDtoMetodo metodo;
  final String? personaId;
  final String? placaLeida;
  final String? zonaId;

  /// Confianza de la lectura, 0..1
  final num confianzaCentesimas;

  /// Identificador del evento en el equipo (RN-17)
  final String referenciaExterna;

  /// Instante REAL del acceso, no el de la reconciliación (CA-22)
  final String ocurridoEn;
  final DecisionDelEdgeDto decision;

  /// KPI-31 · decidido con una caché que pudo haber envejecido
  final bool? cachePotencialmenteObsoleto;

  Map<String, Object?> toJson() => _$EventoReconciliadoDtoToJson(this);
}
