// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'visita_creada_dto_motivo.dart';

part 'visita_creada_dto.g.dart';

@JsonSerializable()
class VisitaCreadaDto {
  const VisitaCreadaDto({
    required this.creada,
    required this.id,
    required this.repetida,
    required this.motivo,
    required this.explicacion,
  });
  
  factory VisitaCreadaDto.fromJson(Map<String, Object?> json) => _$VisitaCreadaDtoFromJson(json);
  
  /// false = una regla de negocio lo impidió
  final bool creada;
  final String? id;

  /// true = este era un reintento y se devolvió la autorización anterior (RN-17)
  final bool repetida;

  /// Motivo TIPADO del rechazo (RN-06, RN-13, P-11, RN-04/CA-03)
  final VisitaCreadaDtoMotivo? motivo;

  /// El mismo motivo en castellano llano; lo escribe el dominio, no la pantalla
  final String? explicacion;

  Map<String, Object?> toJson() => _$VisitaCreadaDtoToJson(this);
}
