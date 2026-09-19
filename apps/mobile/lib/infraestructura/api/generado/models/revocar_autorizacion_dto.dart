// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'revocar_autorizacion_dto.g.dart';

@JsonSerializable()
class RevocarAutorizacionDto {
  const RevocarAutorizacionDto({
    required this.motivo,
  });
  
  factory RevocarAutorizacionDto.fromJson(Map<String, Object?> json) => _$RevocarAutorizacionDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$RevocarAutorizacionDtoToJson(this);
}
