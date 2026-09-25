// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'turno_dto_tipo.dart';

part 'turno_dto.g.dart';

@JsonSerializable()
class TurnoDto {
  const TurnoDto({
    required this.id,
    required this.porteroId,
    required this.porteria,
    required this.dia,
    required this.horaInicio,
    required this.horaFin,
    required this.inicio,
    required this.fin,
    required this.cruzaMedianoche,
    required this.tipo,
    required this.motivo,
  });
  
  factory TurnoDto.fromJson(Map<String, Object?> json) => _$TurnoDtoFromJson(json);
  
  final String id;
  final String porteroId;
  final String? porteria;
  final String dia;
  final String horaInicio;
  final String horaFin;
  final DateTime inicio;
  final DateTime fin;
  final bool cruzaMedianoche;
  final TurnoDtoTipo tipo;
  final String? motivo;

  Map<String, Object?> toJson() => _$TurnoDtoToJson(this);
}
