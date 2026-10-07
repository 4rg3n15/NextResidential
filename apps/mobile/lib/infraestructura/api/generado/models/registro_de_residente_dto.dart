// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'registro_de_residente_dto.g.dart';

@JsonSerializable()
class RegistroDeResidenteDto {
  const RegistroDeResidenteDto({
    required this.usuario,
    required this.correo,
    required this.contrasena,
    required this.confirmacion,
    required this.codigoDeInvitacion,
    required this.fechaNacimiento,
    required this.aceptaTratamientoDeDatos,
    required this.versionPolitica,
  });
  
  factory RegistroDeResidenteDto.fromJson(Map<String, Object?> json) => _$RegistroDeResidenteDtoFromJson(json);
  
  final String usuario;

  /// Contacto NO verificado: no sirve para entrar ni para recuperar la contraseña
  final String correo;
  final String contrasena;

  /// Igual a `contrasena`
  final String confirmacion;

  /// El código de una plaza: `<código corto>-XXXX-XXXX`; guiones y espacios opcionales
  final String codigoDeInvitacion;
  final String fechaNacimiento;

  /// Acepta la política de tratamiento de datos: debe ser true
  final bool aceptaTratamientoDeDatos;

  /// La versión de la política que se mostró
  final String versionPolitica;

  Map<String, Object?> toJson() => _$RegistroDeResidenteDtoToJson(this);
}
