// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'resultado_de_configuracion_dto.g.dart';

@JsonSerializable()
class ResultadoDeConfiguracionDto {
  const ResultadoDeConfiguracionDto({
    required this.aplicada,
    required this.valorAnterior,
    required this.valorNuevo,
    required this.detalle,
  });
  
  factory ResultadoDeConfiguracionDto.fromJson(Map<String, Object?> json) => _$ResultadoDeConfiguracionDtoFromJson(json);
  
  final bool aplicada;
  final String? valorAnterior;
  final String? valorNuevo;

  /// Qué pasó, en palabras
  final String detalle;

  Map<String, Object?> toJson() => _$ResultadoDeConfiguracionDtoToJson(this);
}
