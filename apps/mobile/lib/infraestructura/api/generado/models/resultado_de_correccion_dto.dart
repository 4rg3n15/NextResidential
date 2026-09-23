// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resultado_de_correccion_dto_correccion.dart';

part 'resultado_de_correccion_dto.g.dart';

@JsonSerializable()
class ResultadoDeCorreccionDto {
  const ResultadoDeCorreccionDto({
    required this.correccion,
    required this.aplicada,
    required this.valorAnterior,
    required this.valorNuevo,
    required this.detalle,
  });
  
  factory ResultadoDeCorreccionDto.fromJson(Map<String, Object?> json) => _$ResultadoDeCorreccionDtoFromJson(json);
  
  final ResultadoDeCorreccionDtoCorreccion correccion;
  final bool aplicada;
  final String? valorAnterior;
  final String? valorNuevo;
  final String detalle;

  Map<String, Object?> toJson() => _$ResultadoDeCorreccionDtoToJson(this);
}
