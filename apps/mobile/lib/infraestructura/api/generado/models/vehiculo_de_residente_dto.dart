// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vehiculo_de_residente_dto.g.dart';

@JsonSerializable()
class VehiculoDeResidenteDto {
  const VehiculoDeResidenteDto({
    required this.id,
    required this.viviendaId,
    required this.vivienda,
    required this.placa,
    required this.color,
    required this.modelo,
    required this.marca,
    required this.tipo,
    required this.registradoEn,
    required this.registradoPor,
    required this.ocupantes,
    required this.activo,
  });
  
  factory VehiculoDeResidenteDto.fromJson(Map<String, Object?> json) => _$VehiculoDeResidenteDtoFromJson(json);
  
  final String id;
  final String viviendaId;
  final String vivienda;
  final String placa;
  final String? color;
  final String? modelo;
  final String? marca;
  final String tipo;
  final String registradoEn;
  final String? registradoPor;
  final List<String> ocupantes;
  final bool activo;

  Map<String, Object?> toJson() => _$VehiculoDeResidenteDtoToJson(this);
}
