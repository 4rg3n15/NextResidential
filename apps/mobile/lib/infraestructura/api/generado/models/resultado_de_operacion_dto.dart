// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resultado_de_operacion_dto_estado.dart';
import 'resultado_de_operacion_dto_operacion.dart';

part 'resultado_de_operacion_dto.g.dart';

@JsonSerializable()
class ResultadoDeOperacionDto {
  const ResultadoDeOperacionDto({
    required this.encolada,
    required this.operacion,
    required this.estado,
    required this.detalle,
  });
  
  factory ResultadoDeOperacionDto.fromJson(Map<String, Object?> json) => _$ResultadoDeOperacionDtoFromJson(json);
  
  final bool encolada;
  final ResultadoDeOperacionDtoOperacion operacion;
  final ResultadoDeOperacionDtoEstado estado;
  final String detalle;

  Map<String, Object?> toJson() => _$ResultadoDeOperacionDtoToJson(this);
}
