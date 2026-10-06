// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'edicion_de_vehiculo_propio_dto.g.dart';

@JsonSerializable()
class EdicionDeVehiculoPropioDto {
  const EdicionDeVehiculoPropioDto({
    required this.color,
    required this.modelo,
    this.marca,
    this.ocupantes,
    this.placa,
  });
  
  factory EdicionDeVehiculoPropioDto.fromJson(Map<String, Object?> json) => _$EdicionDeVehiculoPropioDtoFromJson(json);
  
  final String color;
  final String modelo;
  final String? marca;

  /// `residenteId` de su vivienda
  final List<String>? ocupantes;

  /// Sólo si el vehículo no tiene historial
  final String? placa;

  Map<String, Object?> toJson() => _$EdicionDeVehiculoPropioDtoToJson(this);
}
