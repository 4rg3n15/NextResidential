// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'portero_creado_dto.g.dart';

@JsonSerializable()
class PorteroCreadoDto {
  const PorteroCreadoDto({
    required this.usuarioId,
  });
  
  factory PorteroCreadoDto.fromJson(Map<String, Object?> json) => _$PorteroCreadoDtoFromJson(json);
  
  final String usuarioId;

  Map<String, Object?> toJson() => _$PorteroCreadoDtoToJson(this);
}
