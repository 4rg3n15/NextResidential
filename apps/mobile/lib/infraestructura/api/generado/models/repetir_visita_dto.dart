// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'repetir_visita_dto.g.dart';

@JsonSerializable()
class RepetirVisitaDto {
  const RepetirVisitaDto({
    required this.inicio,
    required this.duracionMinutos,
    required this.casillaMarcada,
    required this.claveDeIdempotencia,
  });
  
  factory RepetirVisitaDto.fromJson(Map<String, Object?> json) => _$RepetirVisitaDtoFromJson(json);
  
  final DateTime inicio;
  final num duracionMinutos;
  final bool casillaMarcada;
  final String claveDeIdempotencia;

  Map<String, Object?> toJson() => _$RepetirVisitaDtoToJson(this);
}
