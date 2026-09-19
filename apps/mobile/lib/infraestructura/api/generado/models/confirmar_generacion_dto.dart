// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'confirmar_generacion_dto_estilo.dart';
import 'confirmar_generacion_dto_tipo.dart';
import 'excepcion_de_agrupacion_dto.dart';

part 'confirmar_generacion_dto.g.dart';

@JsonSerializable()
class ConfirmarGeneracionDto {
  const ConfirmarGeneracionDto({
    required this.tipo,
    required this.totalEsperado,
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
  
  factory ConfirmarGeneracionDto.fromJson(Map<String, Object?> json) => _$ConfirmarGeneracionDtoFromJson(json);
  
  final ConfirmarGeneracionDtoTipo tipo;
  final num? agrupaciones;
  final ConfirmarGeneracionDtoEstilo? estilo;
  final num? pisos;
  final num? porPiso;
  final List<ExcepcionDeAgrupacionDto>? excepciones;
  final num? secciones;
  final num? total;
  final bool? reiniciarNumeracion;
  final num? cantidad;
  final num totalEsperado;

  Map<String, Object?> toJson() => _$ConfirmarGeneracionDtoToJson(this);
}
