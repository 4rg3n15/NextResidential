// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'visita_revocada_dto.g.dart';

@JsonSerializable()
class VisitaRevocadaDto {
  const VisitaRevocadaDto({
    required this.revocada,
    required this.rostrosSuprimidos,
    required this.equiposRetirados,
    required this.equiposPendientes,
  });
  
  factory VisitaRevocadaDto.fromJson(Map<String, Object?> json) => _$VisitaRevocadaDtoFromJson(json);
  
  /// Siempre true
  final bool revocada;

  /// Rostros del visitante suprimidos (RN-11)
  final num rostrosSuprimidos;

  /// Equipos de los que ya salió el rostro
  final num equiposRetirados;

  /// Equipos que lo retirarán al reintentar
  final num equiposPendientes;

  Map<String, Object?> toJson() => _$VisitaRevocadaDtoToJson(this);
}
