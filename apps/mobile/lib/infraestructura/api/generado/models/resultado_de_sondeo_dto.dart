// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resultado_de_sondeo_dto_clase.dart';

part 'resultado_de_sondeo_dto.g.dart';

@JsonSerializable()
class ResultadoDeSondeoDto {
  const ResultadoDeSondeoDto({
    required this.clase,
    required this.detalle,
    required this.modelo,
    required this.firmware,
    required this.latenciaMs,
    required this.verificado,
  });
  
  factory ResultadoDeSondeoDto.fromJson(Map<String, Object?> json) => _$ResultadoDeSondeoDtoFromJson(json);
  
  /// Cuatro resultados distintos, nunca uno genérico: cada uno se resuelve de una manera.
  final ResultadoDeSondeoDtoClase clase;
  final String detalle;
  final String? modelo;
  final String? firmware;
  final num? latenciaMs;
  final bool verificado;

  Map<String, Object?> toJson() => _$ResultadoDeSondeoDtoToJson(this);
}
