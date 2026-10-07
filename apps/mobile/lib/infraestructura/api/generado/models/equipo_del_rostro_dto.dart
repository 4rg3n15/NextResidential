// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'equipo_del_rostro_dto_estado.dart';

part 'equipo_del_rostro_dto.g.dart';

@JsonSerializable()
class EquipoDelRostroDto {
  const EquipoDelRostroDto({
    required this.nombre,
    required this.estado,
  });
  
  factory EquipoDelRostroDto.fromJson(Map<String, Object?> json) => _$EquipoDelRostroDtoFromJson(json);
  
  final String nombre;
  final EquipoDelRostroDtoEstado estado;

  Map<String, Object?> toJson() => _$EquipoDelRostroDtoToJson(this);
}
