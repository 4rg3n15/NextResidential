// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'excepcion_de_agrupacion_dto.dart';
import 'plan_de_generacion_dto_estilo.dart';
import 'plan_de_generacion_dto_tipo.dart';

part 'plan_de_generacion_dto.g.dart';

@JsonSerializable()
class PlanDeGeneracionDto {
  const PlanDeGeneracionDto({
    required this.tipo,
    this.agrupaciones,
    this.estilo,
    this.pisos,
    this.porPiso,
    this.excepciones,
    this.secciones,
    this.total,
    this.reiniciarNumeracion,
    this.cantidad,
  });
  
  factory PlanDeGeneracionDto.fromJson(Map<String, Object?> json) => _$PlanDeGeneracionDtoFromJson(json);
  
  final PlanDeGeneracionDtoTipo tipo;
  final num? agrupaciones;
  final PlanDeGeneracionDtoEstilo? estilo;
  final num? pisos;
  final num? porPiso;
  final List<ExcepcionDeAgrupacionDto>? excepciones;
  final num? secciones;
  final num? total;
  final bool? reiniciarNumeracion;
  final num? cantidad;

  Map<String, Object?> toJson() => _$PlanDeGeneracionDtoToJson(this);
}
