// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hecho_de_bitacora_dto.dart';

part 'bitacora_de_porteria_dto.g.dart';

@JsonSerializable()
class BitacoraDePorteriaDto {
  const BitacoraDePorteriaDto({
    required this.hechos,
  });
  
  factory BitacoraDePorteriaDto.fromJson(Map<String, Object?> json) => _$BitacoraDePorteriaDtoFromJson(json);
  
  final List<HechoDeBitacoraDto> hechos;

  Map<String, Object?> toJson() => _$BitacoraDePorteriaDtoToJson(this);
}
