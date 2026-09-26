// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vehiculo_desactivado_dto.g.dart';

@JsonSerializable()
class VehiculoDesactivadoDto {
  const VehiculoDesactivadoDto({
    required this.desactivado,
  });
  
  factory VehiculoDesactivadoDto.fromJson(Map<String, Object?> json) => _$VehiculoDesactivadoDtoFromJson(json);
  
  final bool desactivado;

  Map<String, Object?> toJson() => _$VehiculoDesactivadoDtoToJson(this);
}
