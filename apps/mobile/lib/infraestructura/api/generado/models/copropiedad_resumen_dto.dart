// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'copropiedad_resumen_dto.g.dart';

@JsonSerializable()
class CopropiedadResumenDto {
  const CopropiedadResumenDto({
    required this.id,
    required this.nombre,
    required this.zonaHoraria,
  });
  
  factory CopropiedadResumenDto.fromJson(Map<String, Object?> json) => _$CopropiedadResumenDtoFromJson(json);
  
  final String id;
  final String nombre;

  /// Decide qué significa «hoy» en el tablero. Viaja con cada copropiedad porque un superadministrador puede conmutar entre husos distintos en la misma sesión.
  final String zonaHoraria;

  Map<String, Object?> toJson() => _$CopropiedadResumenDtoToJson(this);
}
