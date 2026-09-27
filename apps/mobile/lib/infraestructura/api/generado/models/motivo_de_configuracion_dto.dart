// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'motivo_de_configuracion_dto.g.dart';

@JsonSerializable()
class MotivoDeConfiguracionDto {
  const MotivoDeConfiguracionDto({
    required this.motivo,
  });
  
  factory MotivoDeConfiguracionDto.fromJson(Map<String, Object?> json) => _$MotivoDeConfiguracionDtoFromJson(json);
  
  /// Por qué se cambia. Queda en la auditoría junto a quién y cuándo.
  final String motivo;

  Map<String, Object?> toJson() => _$MotivoDeConfiguracionDtoToJson(this);
}
