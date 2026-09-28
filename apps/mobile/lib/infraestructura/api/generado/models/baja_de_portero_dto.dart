// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_de_portero_dto.g.dart';

@JsonSerializable()
class BajaDePorteroDto {
  const BajaDePorteroDto({
    required this.motivo,
  });
  
  factory BajaDePorteroDto.fromJson(Map<String, Object?> json) => _$BajaDePorteroDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$BajaDePorteroDtoToJson(this);
}
