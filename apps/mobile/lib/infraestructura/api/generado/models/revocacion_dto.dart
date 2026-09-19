// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'revocacion_dto.g.dart';

@JsonSerializable()
class RevocacionDto {
  const RevocacionDto({
    required this.revocada,
  });
  
  factory RevocacionDto.fromJson(Map<String, Object?> json) => _$RevocacionDtoFromJson(json);
  
  final bool revocada;

  Map<String, Object?> toJson() => _$RevocacionDtoToJson(this);
}
