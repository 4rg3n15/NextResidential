// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'error_de_fila_dto.g.dart';

@JsonSerializable()
class ErrorDeFilaDto {
  const ErrorDeFilaDto({
    required this.fila,
    required this.motivo,
  });
  
  factory ErrorDeFilaDto.fromJson(Map<String, Object?> json) => _$ErrorDeFilaDtoFromJson(json);
  
  final num fila;
  final String motivo;

  Map<String, Object?> toJson() => _$ErrorDeFilaDtoToJson(this);
}
