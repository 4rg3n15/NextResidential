// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'alta_de_portero_dto.g.dart';

@JsonSerializable()
class AltaDePorteroDto {
  const AltaDePorteroDto({
    required this.nombre,
    required this.sectores,
    required this.usuario,
    required this.contrasenaInicial,
    this.telefono,
    this.correoContacto,
    this.porteria,
  });
  
  factory AltaDePorteroDto.fromJson(Map<String, Object?> json) => _$AltaDePorteroDtoFromJson(json);
  
  final String nombre;
  final String? telefono;
  final String? correoContacto;
  final String? porteria;

  /// Torres, sectores o fincas. INFORMATIVOS (P-17): no filtran alarmas.
  final List<String> sectores;

  /// Identificación del portero como usuario
  final String usuario;
  final String contrasenaInicial;

  Map<String, Object?> toJson() => _$AltaDePorteroDtoToJson(this);
}
