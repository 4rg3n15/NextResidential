// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'vehiculo_dto_estado.dart';
import 'vehiculo_dto_tipo.dart';

part 'vehiculo_dto.g.dart';

@JsonSerializable()
class VehiculoDto {
  const VehiculoDto({
    required this.id,
    required this.placa,
    required this.marca,
    required this.modelo,
    required this.color,
    required this.tipo,
    required this.estado,
    required this.viviendaId,
    required this.viviendaIdentificador,
    required this.propietarioId,
    required this.propietarioNombre,
  });
  
  factory VehiculoDto.fromJson(Map<String, Object?> json) => _$VehiculoDtoFromJson(json);
  
  final String id;
  final String placa;
  final String? marca;
  final String? modelo;
  final String? color;
  final VehiculoDtoTipo tipo;
  final VehiculoDtoEstado estado;
  final String viviendaId;
  final String viviendaIdentificador;
  final String? propietarioId;
  final String? propietarioNombre;

  Map<String, Object?> toJson() => _$VehiculoDtoToJson(this);
}
