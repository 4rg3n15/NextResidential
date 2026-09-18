// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'salud_dto.g.dart';

@JsonSerializable()
class SaludDto {
  const SaludDto({
    required this.estado,
    required this.momento,
  });
  
  factory SaludDto.fromJson(Map<String, Object?> json) => _$SaludDtoFromJson(json);
  
  final String estado;
  final DateTime momento;

  Map<String, Object?> toJson() => _$SaludDtoToJson(this);
}
