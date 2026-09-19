// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'permiso_de_zona_dto.g.dart';

@JsonSerializable()
class PermisoDeZonaDto {
  const PermisoDeZonaDto({
    required this.zonaId,
  });
  
  factory PermisoDeZonaDto.fromJson(Map<String, Object?> json) => _$PermisoDeZonaDtoFromJson(json);
  
  final String zonaId;

  Map<String, Object?> toJson() => _$PermisoDeZonaDtoToJson(this);
}
