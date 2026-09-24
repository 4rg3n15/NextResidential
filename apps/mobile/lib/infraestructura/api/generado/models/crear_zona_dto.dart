// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'crear_zona_dto_tipo.dart';

part 'crear_zona_dto.g.dart';

@JsonSerializable()
class CrearZonaDto {
  const CrearZonaDto({
    required this.nombre,
    required this.tipo,
    required this.aforoMaximo,
    this.icono,
    this.normas,
  });
  
  factory CrearZonaDto.fromJson(Map<String, Object?> json) => _$CrearZonaDtoFromJson(json);
  
  final String nombre;
  final CrearZonaDtoTipo tipo;

  /// Aforo máximo simultáneo (RN-14). 0 = sin límite práctico.
  final num aforoMaximo;
  final String? icono;
  final List<String>? normas;

  Map<String, Object?> toJson() => _$CrearZonaDtoToJson(this);
}
