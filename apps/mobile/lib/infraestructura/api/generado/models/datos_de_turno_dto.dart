// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'datos_de_turno_dto_tipo.dart';

part 'datos_de_turno_dto.g.dart';

@JsonSerializable()
class DatosDeTurnoDto {
  const DatosDeTurnoDto({
    required this.porteroId,
    required this.dia,
    required this.horaInicio,
    required this.horaFin,
    required this.tipo,
    this.porteria,
    this.motivo,
  });
  
  factory DatosDeTurnoDto.fromJson(Map<String, Object?> json) => _$DatosDeTurnoDtoFromJson(json);
  
  final String porteroId;
  final String? porteria;

  /// Día en la zona de la copropiedad
  final String dia;
  final String horaInicio;

  /// Si no es posterior al inicio, cruza la medianoche
  final String horaFin;
  final DatosDeTurnoDtoTipo tipo;

  /// Obligatorio en un turno extra
  final String? motivo;

  Map<String, Object?> toJson() => _$DatosDeTurnoDtoToJson(this);
}
