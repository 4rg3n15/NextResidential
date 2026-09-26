// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'perfil_del_residente_dto.g.dart';

@JsonSerializable()
class PerfilDelResidenteDto {
  const PerfilDelResidenteDto({
    required this.nombres,
    required this.apellidos,
    required this.nombreCompleto,
    required this.fechaNacimiento,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.correo,
    required this.telefono,
    required this.copropiedadNombre,
    required this.copropiedadDireccion,
    required this.telefonoPorteria,
  });
  
  factory PerfilDelResidenteDto.fromJson(Map<String, Object?> json) => _$PerfilDelResidenteDtoFromJson(json);
  
  final String? nombres;
  final String? apellidos;
  final String nombreCompleto;
  final String? fechaNacimiento;
  final String? tipoDocumento;
  final String? numeroDocumento;
  final String? correo;
  final String? telefono;
  final String copropiedadNombre;
  final String? copropiedadDireccion;

  /// D7 · null = el superadministrador no lo ha registrado
  final String? telefonoPorteria;

  Map<String, Object?> toJson() => _$PerfilDelResidenteDtoToJson(this);
}
