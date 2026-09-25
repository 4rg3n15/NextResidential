// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'editar_vehiculo_dto_tipo.dart';

part 'editar_vehiculo_dto.g.dart';

@JsonSerializable()
class EditarVehiculoDto {
  const EditarVehiculoDto({
    this.placa,
    this.personaId,
    this.marca,
    this.modelo,
    this.color,
    this.tipo,
  });
  
  factory EditarVehiculoDto.fromJson(Map<String, Object?> json) => _$EditarVehiculoDtoFromJson(json);
  
  final String? placa;
  final String? personaId;
  final String? marca;
  final String? modelo;
  final String? color;
  final EditarVehiculoDtoTipo? tipo;

  Map<String, Object?> toJson() => _$EditarVehiculoDtoToJson(this);
}
