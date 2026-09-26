// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'campo_rechazado_dto.g.dart';

@JsonSerializable()
class CampoRechazadoDto {
  const CampoRechazadoDto({
    required this.campo,
    required this.motivo,
  });
  
  factory CampoRechazadoDto.fromJson(Map<String, Object?> json) => _$CampoRechazadoDtoFromJson(json);
  
  final String campo;
  final String motivo;

  Map<String, Object?> toJson() => _$CampoRechazadoDtoToJson(this);
}
