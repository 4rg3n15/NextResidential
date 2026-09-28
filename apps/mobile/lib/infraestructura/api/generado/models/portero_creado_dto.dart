// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'portero_creado_dto.g.dart';

@JsonSerializable()
class PorteroCreadoDto {
  const PorteroCreadoDto({
    required this.usuarioId,
    required this.numero,
  });
  
  factory PorteroCreadoDto.fromJson(Map<String, Object?> json) => _$PorteroCreadoDtoFromJson(json);
  
  final String usuarioId;

  /// El número con el que entrará el portero (H2, ADR-031)
  final num numero;

  Map<String, Object?> toJson() => _$PorteroCreadoDtoToJson(this);
}
