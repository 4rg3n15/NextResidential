// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'generacion_aplicada_dto.g.dart';

@JsonSerializable()
class GeneracionAplicadaDto {
  const GeneracionAplicadaDto({
    required this.creadas,
  });
  
  factory GeneracionAplicadaDto.fromJson(Map<String, Object?> json) => _$GeneracionAplicadaDtoFromJson(json);
  
  final num creadas;

  Map<String, Object?> toJson() => _$GeneracionAplicadaDtoToJson(this);
}
