// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'nombre_de_equipo_dto_tipo.dart';

part 'nombre_de_equipo_dto.g.dart';

@JsonSerializable()
class NombreDeEquipoDto {
  const NombreDeEquipoDto({
    required this.id,
    required this.nombre,
    required this.tipo,
    required this.activo,
  });
  
  factory NombreDeEquipoDto.fromJson(Map<String, Object?> json) => _$NombreDeEquipoDtoFromJson(json);
  
  final String id;
  final String nombre;
  final NombreDeEquipoDtoTipo tipo;
  final bool activo;

  Map<String, Object?> toJson() => _$NombreDeEquipoDtoToJson(this);
}
