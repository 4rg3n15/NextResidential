// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'aparato_registrado_dto.g.dart';

@JsonSerializable()
class AparatoRegistradoDto {
  const AparatoRegistradoDto({
    required this.id,
  });
  
  factory AparatoRegistradoDto.fromJson(Map<String, Object?> json) => _$AparatoRegistradoDtoFromJson(json);
  
  final String id;

  Map<String, Object?> toJson() => _$AparatoRegistradoDtoToJson(this);
}
