// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'modo_vigente_dto.dart';

part 'modos_vigentes_dto.g.dart';

@JsonSerializable()
class ModosVigentesDto {
  const ModosVigentesDto({
    required this.modos,
  });
  
  factory ModosVigentesDto.fromJson(Map<String, Object?> json) => _$ModosVigentesDtoFromJson(json);
  
  final List<ModoVigenteDto> modos;

  Map<String, Object?> toJson() => _$ModosVigentesDtoToJson(this);
}
