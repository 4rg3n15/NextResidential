// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'vehiculo_propio_dto_tipo.dart';

part 'vehiculo_propio_dto.g.dart';

@JsonSerializable()
class VehiculoPropioDto {
  const VehiculoPropioDto({
    required this.placa,
    required this.color,
    required this.modelo,
    required this.tipo,
    required this.ocupantes,
    this.marca,
  });
  
  factory VehiculoPropioDto.fromJson(Map<String, Object?> json) => _$VehiculoPropioDtoFromJson(json);
  
  final String placa;
  final String color;
  final String modelo;
  final String? marca;
  final VehiculoPropioDtoTipo tipo;

  /// `residenteId` de los ocupantes vinculados
  final List<String> ocupantes;

  Map<String, Object?> toJson() => _$VehiculoPropioDtoToJson(this);
}
