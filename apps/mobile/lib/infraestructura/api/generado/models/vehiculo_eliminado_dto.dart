// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'vehiculo_eliminado_dto_resultado.dart';

part 'vehiculo_eliminado_dto.g.dart';

@JsonSerializable()
class VehiculoEliminadoDto {
  const VehiculoEliminadoDto({
    required this.resultado,
  });
  
  factory VehiculoEliminadoDto.fromJson(Map<String, Object?> json) => _$VehiculoEliminadoDtoFromJson(json);
  
  final VehiculoEliminadoDtoResultado resultado;

  Map<String, Object?> toJson() => _$VehiculoEliminadoDtoToJson(this);
}
