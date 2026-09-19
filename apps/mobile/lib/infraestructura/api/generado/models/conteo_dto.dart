// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'conteo_dto.g.dart';

@JsonSerializable()
class ConteoDto {
  const ConteoDto({
    required this.conteo,
  });
  
  factory ConteoDto.fromJson(Map<String, Object?> json) => _$ConteoDtoFromJson(json);
  
  final num conteo;

  Map<String, Object?> toJson() => _$ConteoDtoToJson(this);
}
