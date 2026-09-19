// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'alerta_expuesta_dto_estado.dart';
import 'alerta_expuesta_dto_severidad.dart';
import 'alerta_expuesta_dto_tipo.dart';

part 'alerta_expuesta_dto.g.dart';

@JsonSerializable()
class AlertaExpuestaDto {
  const AlertaExpuestaDto({
    required this.id,
    required this.tipo,
    required this.severidad,
    required this.estado,
    required this.generadaEn,
    required this.escaladaEn,
    required this.eventoId,
    required this.dispositivoId,
    required this.escaladaDentroDelPlazo,
    required this.notas,
  });
  
  factory AlertaExpuestaDto.fromJson(Map<String, Object?> json) => _$AlertaExpuestaDtoFromJson(json);
  
  final String id;
  final AlertaExpuestaDtoTipo tipo;
  final AlertaExpuestaDtoSeveridad severidad;
  final AlertaExpuestaDtoEstado estado;
  final DateTime generadaEn;
  final DateTime? escaladaEn;
  final String? eventoId;
  final String? dispositivoId;

  /// KPI-25 medido, no supuesto: null mientras no se haya escalado
  final bool? escaladaDentroDelPlazo;
  final String? notas;

  Map<String, Object?> toJson() => _$AlertaExpuestaDtoToJson(this);
}
