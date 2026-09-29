// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mi_visita_generada_dto_motivo.dart';

part 'mi_visita_generada_dto.g.dart';

@JsonSerializable()
class MiVisitaGeneradaDto {
  const MiVisitaGeneradaDto({
    required this.creada,
    required this.id,
    required this.repetida,
    required this.motivo,
    required this.explicacion,
    required this.motivosDeFoto,
    required this.equipos,
    required this.sincronizadas,
    required this.fallidas,
    required this.avisoDeSincronizacion,
    required this.confirmacionDePlaca,
  });
  
  factory MiVisitaGeneradaDto.fromJson(Map<String, Object?> json) => _$MiVisitaGeneradaDtoFromJson(json);
  
  final bool creada;
  final String? id;
  final bool repetida;
  final MiVisitaGeneradaDtoMotivo? motivo;
  final String? explicacion;

  /// Por qué la foto no sirvió, si no sirvió
  final List<String> motivosDeFoto;

  /// Equipos de la copropiedad que admiten rostros
  final num equipos;
  final num sincronizadas;
  final num fallidas;
  final String? avisoDeSincronizacion;
  final String? confirmacionDePlaca;

  Map<String, Object?> toJson() => _$MiVisitaGeneradaDtoToJson(this);
}
