// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'campo_rechazado_dto.dart';
import 'resultado_de_alta_dto_motivo.dart';

part 'resultado_de_alta_dto.g.dart';

@JsonSerializable()
class ResultadoDeAltaDto {
  const ResultadoDeAltaDto({
    required this.vinculada,
    required this.debeDeclararOcupantes,
    required this.motivo,
    required this.explicacion,
    required this.campos,
  });
  
  factory ResultadoDeAltaDto.fromJson(Map<String, Object?> json) => _$ResultadoDeAltaDtoFromJson(json);
  
  final bool vinculada;
  final bool debeDeclararOcupantes;
  final ResultadoDeAltaDtoMotivo? motivo;
  final String? explicacion;
  final List<CampoRechazadoDto> campos;

  Map<String, Object?> toJson() => _$ResultadoDeAltaDtoToJson(this);
}
