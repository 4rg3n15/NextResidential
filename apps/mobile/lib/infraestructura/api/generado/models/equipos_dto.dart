// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'equipo_dto.dart';

part 'equipos_dto.g.dart';

@JsonSerializable()
class EquiposDto {
  const EquiposDto({
    required this.equipos,
  });
  
  factory EquiposDto.fromJson(Map<String, Object?> json) => _$EquiposDtoFromJson(json);
  
  final List<EquipoDto> equipos;

  Map<String, Object?> toJson() => _$EquiposDtoToJson(this);
}
