// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'datos_del_portero_dto.g.dart';

@JsonSerializable()
class DatosDelPorteroDto {
  const DatosDelPorteroDto({
    required this.nombre,
    required this.sectores,
    this.telefono,
    this.correoContacto,
    this.porteria,
  });
  
  factory DatosDelPorteroDto.fromJson(Map<String, Object?> json) => _$DatosDelPorteroDtoFromJson(json);
  
  final String nombre;
  final String? telefono;
  final String? correoContacto;
  final String? porteria;

  /// Torres, sectores o fincas. INFORMATIVOS (P-17): no filtran alarmas.
  final List<String> sectores;

  Map<String, Object?> toJson() => _$DatosDelPorteroDtoToJson(this);
}
