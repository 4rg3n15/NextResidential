// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'instantanea_sin_cambios_dto_sin_cambios.dart';

part 'instantanea_sin_cambios_dto.g.dart';

@JsonSerializable()
class InstantaneaSinCambiosDto {
  const InstantaneaSinCambiosDto({
    required this.copropiedadId,
    required this.version,
    required this.sinCambios,
    required this.generadaEn,
  });
  
  factory InstantaneaSinCambiosDto.fromJson(Map<String, Object?> json) => _$InstantaneaSinCambiosDtoFromJson(json);
  
  final String copropiedadId;
  final num version;
  final InstantaneaSinCambiosDtoSinCambios sinCambios;

  /// La nube da fe de la versión AHORA
  final DateTime generadaEn;

  Map<String, Object?> toJson() => _$InstantaneaSinCambiosDtoToJson(this);
}
