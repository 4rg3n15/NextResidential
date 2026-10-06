// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vehiculo_editado_dto.g.dart';

@JsonSerializable()
class VehiculoEditadoDto {
  const VehiculoEditadoDto({
    required this.editado,
  });
  
  factory VehiculoEditadoDto.fromJson(Map<String, Object?> json) => _$VehiculoEditadoDtoFromJson(json);
  
  /// Siempre true
  final bool editado;

  Map<String, Object?> toJson() => _$VehiculoEditadoDtoToJson(this);
}
