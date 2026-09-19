// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'latido_dto.g.dart';

@JsonSerializable()
class LatidoDto {
  const LatidoDto({
    required this.copropiedadId,
    required this.dispositivoId,
  });
  
  factory LatidoDto.fromJson(Map<String, Object?> json) => _$LatidoDtoFromJson(json);
  
  final String copropiedadId;
  final String dispositivoId;

  Map<String, Object?> toJson() => _$LatidoDtoToJson(this);
}
