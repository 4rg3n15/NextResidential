// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'grupo_proyectado_dto.g.dart';

@JsonSerializable()
class GrupoProyectadoDto {
  const GrupoProyectadoDto({
    required this.agrupacion,
    required this.cantidad,
    required this.primeras,
    required this.ultimas,
    required this.porExcepcion,
  });
  
  factory GrupoProyectadoDto.fromJson(Map<String, Object?> json) => _$GrupoProyectadoDtoFromJson(json);
  
  final String? agrupacion;
  final num cantidad;
  final List<String> primeras;
  final List<String> ultimas;
  final bool porExcepcion;

  Map<String, Object?> toJson() => _$GrupoProyectadoDtoToJson(this);
}
