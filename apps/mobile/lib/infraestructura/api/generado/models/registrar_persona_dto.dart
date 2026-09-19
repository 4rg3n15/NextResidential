// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registrar_persona_dto_tipo_documento.dart';

part 'registrar_persona_dto.g.dart';

@JsonSerializable()
class RegistrarPersonaDto {
  const RegistrarPersonaDto({
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.nombreCompleto,
    this.telefono,
    this.correo,
  });
  
  factory RegistrarPersonaDto.fromJson(Map<String, Object?> json) => _$RegistrarPersonaDtoFromJson(json);
  
  /// Catálogo del enumerado `tipo_documento` de la migración 0002.
  final RegistrarPersonaDtoTipoDocumento tipoDocumento;

  /// Se admite con puntos o espacios: el objeto de valor lo normaliza.
  final String numeroDocumento;
  final String nombreCompleto;
  final String? telefono;
  final String? correo;

  Map<String, Object?> toJson() => _$RegistrarPersonaDtoToJson(this);
}
