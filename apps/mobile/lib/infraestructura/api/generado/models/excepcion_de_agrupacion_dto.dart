// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'excepcion_de_agrupacion_dto.g.dart';

@JsonSerializable()
class ExcepcionDeAgrupacionDto {
  const ExcepcionDeAgrupacionDto({
    required this.agrupacion,
    required this.cantidad,
  });
  
  factory ExcepcionDeAgrupacionDto.fromJson(Map<String, Object?> json) => _$ExcepcionDeAgrupacionDtoFromJson(json);
  
  final String agrupacion;
  final num cantidad;

  Map<String, Object?> toJson() => _$ExcepcionDeAgrupacionDtoToJson(this);
}
