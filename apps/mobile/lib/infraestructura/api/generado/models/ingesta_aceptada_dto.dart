// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ingesta_aceptada_dto.g.dart';

@JsonSerializable()
class IngestaAceptadaDto {
  const IngestaAceptadaDto({
    required this.aceptado,
  });
  
  factory IngestaAceptadaDto.fromJson(Map<String, Object?> json) => _$IngestaAceptadaDtoFromJson(json);
  
  final bool aceptado;

  Map<String, Object?> toJson() => _$IngestaAceptadaDtoToJson(this);
}
