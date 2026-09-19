// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'aceptado_dto.g.dart';

@JsonSerializable()
class AceptadoDto {
  const AceptadoDto({
    required this.aceptado,
    this.detalle,
  });
  
  factory AceptadoDto.fromJson(Map<String, Object?> json) => _$AceptadoDtoFromJson(json);
  
  final bool aceptado;
  final String? detalle;

  Map<String, Object?> toJson() => _$AceptadoDtoToJson(this);
}
