// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bloqueo_vigente_dto.dart';

part 'bloqueos_vigentes_dto.g.dart';

@JsonSerializable()
class BloqueosVigentesDto {
  const BloqueosVigentesDto({
    required this.bloqueos,
  });
  
  factory BloqueosVigentesDto.fromJson(Map<String, Object?> json) => _$BloqueosVigentesDtoFromJson(json);
  
  final List<BloqueoVigenteDto> bloqueos;

  Map<String, Object?> toJson() => _$BloqueosVigentesDtoToJson(this);
}
