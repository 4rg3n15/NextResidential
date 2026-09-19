// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_dto.g.dart';

@JsonSerializable()
class BajaDto {
  const BajaDto({
    required this.desactivado,
  });
  
  factory BajaDto.fromJson(Map<String, Object?> json) => _$BajaDtoFromJson(json);
  
  final bool desactivado;

  Map<String, Object?> toJson() => _$BajaDtoToJson(this);
}
