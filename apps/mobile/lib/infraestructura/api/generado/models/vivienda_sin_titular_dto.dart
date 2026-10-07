// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vivienda_sin_titular_dto.g.dart';

@JsonSerializable()
class ViviendaSinTitularDto {
  const ViviendaSinTitularDto({
    required this.id,
    required this.identificador,
    required this.agrupacion,
  });
  
  factory ViviendaSinTitularDto.fromJson(Map<String, Object?> json) => _$ViviendaSinTitularDtoFromJson(json);
  
  final String id;
  final String identificador;
  final String? agrupacion;

  Map<String, Object?> toJson() => _$ViviendaSinTitularDtoToJson(this);
}
