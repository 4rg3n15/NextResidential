// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'persona_resuelta_dto.g.dart';

@JsonSerializable()
class PersonaResueltaDto {
  const PersonaResueltaDto({
    required this.id,
    required this.nombreCompleto,
    required this.yaExistia,
  });
  
  factory PersonaResueltaDto.fromJson(Map<String, Object?> json) => _$PersonaResueltaDtoFromJson(json);
  
  final String id;
  final String nombreCompleto;
  final bool yaExistia;

  Map<String, Object?> toJson() => _$PersonaResueltaDtoToJson(this);
}
