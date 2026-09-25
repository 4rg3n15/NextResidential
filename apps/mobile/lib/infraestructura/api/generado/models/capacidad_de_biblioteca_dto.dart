// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'capacidad_de_biblioteca_dto_estado.dart';

part 'capacidad_de_biblioteca_dto.g.dart';

@JsonSerializable()
class CapacidadDeBibliotecaDto {
  const CapacidadDeBibliotecaDto({
    required this.estado,
    required this.maximo,
    required this.almacenadas,
  });
  
  factory CapacidadDeBibliotecaDto.fromJson(Map<String, Object?> json) => _$CapacidadDeBibliotecaDtoFromJson(json);
  
  final CapacidadDeBibliotecaDtoEstado estado;
  final num? maximo;
  final num? almacenadas;

  Map<String, Object?> toJson() => _$CapacidadDeBibliotecaDtoToJson(this);
}
