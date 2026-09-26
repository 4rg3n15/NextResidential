// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'turno_dto.dart';

part 'turno_guardado_dto.g.dart';

@JsonSerializable()
class TurnoGuardadoDto {
  const TurnoGuardadoDto({
    required this.turno,
    required this.solapes,
  });
  
  factory TurnoGuardadoDto.fromJson(Map<String, Object?> json) => _$TurnoGuardadoDtoFromJson(json);
  
  final TurnoDto turno;

  /// Solapes con la misma portería: se permiten y se registran
  final List<TurnoDto> solapes;

  Map<String, Object?> toJson() => _$TurnoGuardadoDtoToJson(this);
}
