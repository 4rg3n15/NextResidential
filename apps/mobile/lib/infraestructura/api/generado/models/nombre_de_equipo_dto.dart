// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'nombre_de_equipo_dto.g.dart';

@JsonSerializable()
class NombreDeEquipoDto {
  const NombreDeEquipoDto({
    required this.id,
    required this.nombre,
  });
  
  factory NombreDeEquipoDto.fromJson(Map<String, Object?> json) => _$NombreDeEquipoDtoFromJson(json);
  
  final String id;
  final String nombre;

  Map<String, Object?> toJson() => _$NombreDeEquipoDtoToJson(this);
}
