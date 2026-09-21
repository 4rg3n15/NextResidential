// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'resultado_de_reconciliacion_dto.g.dart';

@JsonSerializable()
class ResultadoDeReconciliacionDto {
  const ResultadoDeReconciliacionDto({
    required this.claveIdempotencia,
    required this.aceptado,
    required this.duplicado,
    this.detalle,
  });
  
  factory ResultadoDeReconciliacionDto.fromJson(Map<String, Object?> json) => _$ResultadoDeReconciliacionDtoFromJson(json);
  
  /// La clave con la que el Edge lo reconocerá en su bandeja
  final String claveIdempotencia;
  final bool aceptado;

  /// La nube ya lo tenía. NO es un error: el Edge reenvía porque no sabe si llegó (CA-22)
  final bool duplicado;

  /// Por qué no se aceptó, si no se aceptó
  final String? detalle;

  Map<String, Object?> toJson() => _$ResultadoDeReconciliacionDtoToJson(this);
}
