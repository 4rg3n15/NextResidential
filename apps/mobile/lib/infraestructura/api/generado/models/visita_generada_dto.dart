// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'equipo_de_la_sincronizacion_dto.dart';

part 'visita_generada_dto.g.dart';

@JsonSerializable()
class VisitaGeneradaDto {
  const VisitaGeneradaDto({
    required this.generada,
    required this.autorizacionId,
    required this.motivosDeFoto,
    required this.equipos,
    required this.sincronizadas,
    required this.fallidas,
    required this.porEquipo,
    required this.avisoDeSincronizacion,
    required this.confirmacionDePlaca,
  });
  
  factory VisitaGeneradaDto.fromJson(Map<String, Object?> json) => _$VisitaGeneradaDtoFromJson(json);
  
  final bool generada;
  final String? autorizacionId;

  /// Por qué no sirvió la foto, si no sirvió
  final List<String> motivosDeFoto;

  /// Equipos con biblioteca de rostros de la copropiedad
  final num equipos;
  final num sincronizadas;
  final num fallidas;
  final List<EquipoDeLaSincronizacionDto> porEquipo;
  final String? avisoDeSincronizacion;
  final String? confirmacionDePlaca;

  Map<String, Object?> toJson() => _$VisitaGeneradaDtoToJson(this);
}
