// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hecho_de_porteria_dto_hecho.dart';

part 'hecho_de_porteria_dto.g.dart';

@JsonSerializable()
class HechoDePorteriaDto {
  const HechoDePorteriaDto({
    required this.hecho,
  });
  
  factory HechoDePorteriaDto.fromJson(Map<String, Object?> json) => _$HechoDePorteriaDtoFromJson(json);
  
  final HechoDePorteriaDtoHecho hecho;

  Map<String, Object?> toJson() => _$HechoDePorteriaDtoToJson(this);
}
