// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'excepcion_de_agrupacion_dto.dart';
import 'plan_de_generacion_dto_estilo.dart';

part 'plan_de_generacion_dto.g.dart';

@JsonSerializable()
class PlanDeGeneracionDto {
  const PlanDeGeneracionDto({
    required this.agrupaciones,
    required this.cantidad,
    this.estilo,
    this.porPiso,
    this.reiniciarNumeracion,
    this.excepciones,
  });
  
  factory PlanDeGeneracionDto.fromJson(Map<String, Object?> json) => _$PlanDeGeneracionDtoFromJson(json);
  
  final num agrupaciones;
  final PlanDeGeneracionDtoEstilo? estilo;
  final num cantidad;
  final num? porPiso;
  final bool? reiniciarNumeracion;
  final List<ExcepcionDeAgrupacionDto>? excepciones;

  Map<String, Object?> toJson() => _$PlanDeGeneracionDtoToJson(this);
}
