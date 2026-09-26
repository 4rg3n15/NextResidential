// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'veto_levantado_dto.g.dart';

@JsonSerializable()
class VetoLevantadoDto {
  const VetoLevantadoDto({
    required this.levantado,
  });
  
  factory VetoLevantadoDto.fromJson(Map<String, Object?> json) => _$VetoLevantadoDtoFromJson(json);
  
  final bool levantado;

  Map<String, Object?> toJson() => _$VetoLevantadoDtoToJson(this);
}
