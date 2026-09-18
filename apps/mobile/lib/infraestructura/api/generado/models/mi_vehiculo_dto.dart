// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mi_vehiculo_dto.g.dart';

@JsonSerializable()
class MiVehiculoDto {
  const MiVehiculoDto({
    required this.id,
    required this.placa,
    required this.marca,
    required this.modelo,
    required this.color,
    required this.esPrincipal,
    required this.activo,
  });
  
  factory MiVehiculoDto.fromJson(Map<String, Object?> json) => _$MiVehiculoDtoFromJson(json);
  
  final String id;
  final String placa;
  final String? marca;
  final String? modelo;
  final String? color;
  final bool esPrincipal;
  final bool activo;

  Map<String, Object?> toJson() => _$MiVehiculoDtoToJson(this);
}
