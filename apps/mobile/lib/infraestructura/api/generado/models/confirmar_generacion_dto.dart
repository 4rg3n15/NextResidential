// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'confirmar_generacion_dto_estilo.dart';
import 'excepcion_de_agrupacion_dto.dart';

part 'confirmar_generacion_dto.g.dart';

@JsonSerializable()
class ConfirmarGeneracionDto {
  const ConfirmarGeneracionDto({
    required this.agrupaciones,
    required this.cantidad,
    required this.totalEsperado,
    this.estilo,
    this.porPiso,
    this.reiniciarNumeracion,
    this.excepciones,
  });
  
  factory ConfirmarGeneracionDto.fromJson(Map<String, Object?> json) => _$ConfirmarGeneracionDtoFromJson(json);
  
  final num agrupaciones;
  final ConfirmarGeneracionDtoEstilo? estilo;
  final num cantidad;
  final num? porPiso;
  final bool? reiniciarNumeracion;
  final List<ExcepcionDeAgrupacionDto>? excepciones;
  final num totalEsperado;

  Map<String, Object?> toJson() => _$ConfirmarGeneracionDtoToJson(this);
}
