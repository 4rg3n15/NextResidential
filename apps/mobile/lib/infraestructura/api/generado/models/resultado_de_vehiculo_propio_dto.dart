// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resultado_de_vehiculo_propio_dto_motivo.dart';

part 'resultado_de_vehiculo_propio_dto.g.dart';

@JsonSerializable()
class ResultadoDeVehiculoPropioDto {
  const ResultadoDeVehiculoPropioDto({
    required this.registrado,
    required this.id,
    required this.motivo,
    required this.explicacion,
  });
  
  factory ResultadoDeVehiculoPropioDto.fromJson(Map<String, Object?> json) => _$ResultadoDeVehiculoPropioDtoFromJson(json);
  
  final bool registrado;
  final String? id;
  final ResultadoDeVehiculoPropioDtoMotivo? motivo;
  final String? explicacion;

  Map<String, Object?> toJson() => _$ResultadoDeVehiculoPropioDtoToJson(this);
}
