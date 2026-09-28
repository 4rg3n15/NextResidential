// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cupo_de_porteros_dto.g.dart';

@JsonSerializable()
class CupoDePorterosDto {
  const CupoDePorterosDto({
    required this.cupo,
  });
  
  factory CupoDePorterosDto.fromJson(Map<String, Object?> json) => _$CupoDePorterosDtoFromJson(json);
  
  final num cupo;

  Map<String, Object?> toJson() => _$CupoDePorterosDtoToJson(this);
}
