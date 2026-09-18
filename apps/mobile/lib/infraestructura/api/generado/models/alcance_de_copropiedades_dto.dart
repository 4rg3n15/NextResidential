// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'copropiedad_resumen_dto.dart';

part 'alcance_de_copropiedades_dto.g.dart';

@JsonSerializable()
class AlcanceDeCopropiedadesDto {
  const AlcanceDeCopropiedadesDto({
    required this.copropiedades,
    required this.alcanceGlobal,
  });
  
  factory AlcanceDeCopropiedadesDto.fromJson(Map<String, Object?> json) => _$AlcanceDeCopropiedadesDtoFromJson(json);
  
  /// Las copropiedades que el token alcanza, y solo esas. Para el superadministrador son todas las activas; para un administrador, la suya; para un operador de central, las de su turno. Un arreglo vacío es una respuesta legítima.
  final List<CopropiedadResumenDto> copropiedades;

  /// true cuando el alcance es global y no viene de una pertenencia concreta (superadministrador). La consola lo usa para explicar por qué puede conmutar.
  final bool alcanceGlobal;

  Map<String, Object?> toJson() => _$AlcanceDeCopropiedadesDtoToJson(this);
}
