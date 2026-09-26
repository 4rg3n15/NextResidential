// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'perfil_dto_tipo_documento.dart';

part 'perfil_dto.g.dart';

@JsonSerializable()
class PerfilDto {
  const PerfilDto({
    required this.nombres,
    required this.apellidos,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.correo,
    required this.telefono,
    this.fechaNacimiento,
  });
  
  factory PerfilDto.fromJson(Map<String, Object?> json) => _$PerfilDtoFromJson(json);
  
  final String nombres;
  final String apellidos;
  final String? fechaNacimiento;
  final PerfilDtoTipoDocumento tipoDocumento;
  final String numeroDocumento;

  /// Canal de CONTACTO, no de acceso
  final String correo;

  /// Canal de CONTACTO, no de acceso
  final String telefono;

  Map<String, Object?> toJson() => _$PerfilDtoToJson(this);
}
