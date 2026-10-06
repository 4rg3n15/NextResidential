// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cambio_de_tope_por_omision_dto.g.dart';

@JsonSerializable()
class CambioDeTopePorOmisionDto {
  const CambioDeTopePorOmisionDto({
    required this.tope,
    required this.motivo,
  });
  
  factory CambioDeTopePorOmisionDto.fromJson(Map<String, Object?> json) => _$CambioDeTopePorOmisionDtoFromJson(json);
  
  final num tope;
  final String motivo;

  Map<String, Object?> toJson() => _$CambioDeTopePorOmisionDtoToJson(this);
}
