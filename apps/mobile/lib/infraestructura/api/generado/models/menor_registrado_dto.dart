// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'menor_registrado_dto.g.dart';

@JsonSerializable()
class MenorRegistradoDto {
  const MenorRegistradoDto({
    required this.residenteId,
  });
  
  factory MenorRegistradoDto.fromJson(Map<String, Object?> json) => _$MenorRegistradoDtoFromJson(json);
  
  final String residenteId;

  Map<String, Object?> toJson() => _$MenorRegistradoDtoToJson(this);
}
