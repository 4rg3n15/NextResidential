// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registrar_vehiculo_dto_tipo.dart';

part 'registrar_vehiculo_dto.g.dart';

@JsonSerializable()
class RegistrarVehiculoDto {
  const RegistrarVehiculoDto({
    required this.viviendaId,
    required this.placa,
    this.personaId,
    this.marca,
    this.modelo,
    this.color,
    this.tipo,
  });
  
  factory RegistrarVehiculoDto.fromJson(Map<String, Object?> json) => _$RegistrarVehiculoDtoFromJson(json);
  
  final String viviendaId;
  final String placa;
  final String? personaId;
  final String? marca;
  final String? modelo;
  final String? color;
  final RegistrarVehiculoDtoTipo? tipo;

  Map<String, Object?> toJson() => _$RegistrarVehiculoDtoToJson(this);
}
