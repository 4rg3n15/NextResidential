// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'visita_rechazada_dto.g.dart';

@JsonSerializable()
class VisitaRechazadaDto {
  const VisitaRechazadaDto({
    required this.equiposRetirados,
    required this.equiposPendientes,
  });
  
  factory VisitaRechazadaDto.fromJson(Map<String, Object?> json) => _$VisitaRechazadaDtoFromJson(json);
  
  final num equiposRetirados;
  final num equiposPendientes;

  Map<String, Object?> toJson() => _$VisitaRechazadaDtoToJson(this);
}
