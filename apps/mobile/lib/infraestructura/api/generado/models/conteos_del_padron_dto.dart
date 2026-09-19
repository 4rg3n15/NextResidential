// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'conteos_del_padron_dto.g.dart';

@JsonSerializable()
class ConteosDelPadronDto {
  const ConteosDelPadronDto({
    required this.residentesActivos,
    required this.residentesAltaEnVentana,
    required this.vehiculosActivos,
    required this.vehiculosAltaEnVentana,
  });
  
  factory ConteosDelPadronDto.fromJson(Map<String, Object?> json) => _$ConteosDelPadronDtoFromJson(json);
  
  final num residentesActivos;
  final num residentesAltaEnVentana;
  final num vehiculosActivos;
  final num vehiculosAltaEnVentana;

  Map<String, Object?> toJson() => _$ConteosDelPadronDtoToJson(this);
}
