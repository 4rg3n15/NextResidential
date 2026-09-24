// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_de_zona_dto.g.dart';

@JsonSerializable()
class BajaDeZonaDto {
  const BajaDeZonaDto({
    required this.motivo,
  });
  
  factory BajaDeZonaDto.fromJson(Map<String, Object?> json) => _$BajaDeZonaDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$BajaDeZonaDtoToJson(this);
}
