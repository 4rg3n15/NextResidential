// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'tope_por_omision_dto.g.dart';

@JsonSerializable()
class TopePorOmisionDto {
  const TopePorOmisionDto({
    required this.tope,
  });
  
  factory TopePorOmisionDto.fromJson(Map<String, Object?> json) => _$TopePorOmisionDtoFromJson(json);
  
  /// Plazas por vivienda, contando al titular, salvo tope propio
  final num tope;

  Map<String, Object?> toJson() => _$TopePorOmisionDtoToJson(this);
}
