// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'turno_dto.dart';

part 'turnos_dto.g.dart';

@JsonSerializable()
class TurnosDto {
  const TurnosDto({
    required this.turnos,
  });
  
  factory TurnosDto.fromJson(Map<String, Object?> json) => _$TurnosDtoFromJson(json);
  
  final List<TurnoDto> turnos;

  Map<String, Object?> toJson() => _$TurnosDtoToJson(this);
}
