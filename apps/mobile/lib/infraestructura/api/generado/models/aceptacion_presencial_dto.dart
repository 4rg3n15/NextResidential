// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'aceptacion_presencial_dto.g.dart';

@JsonSerializable()
class AceptacionPresencialDto {
  const AceptacionPresencialDto({
    required this.nombreCompleto,
    required this.numeroDocumento,
    required this.versionPolitica,
    required this.aceptaPolitica,
  });
  
  factory AceptacionPresencialDto.fromJson(Map<String, Object?> json) => _$AceptacionPresencialDtoFromJson(json);
  
  /// Nombre completo, escrito por el propio titular
  final String nombreCompleto;

  /// Número de documento, escrito por el propio titular
  final String numeroDocumento;

  /// Versión de la política que se le mostró y aceptó
  final String versionPolitica;

  /// Declaración expresa del titular: leyó y acepta. Sólo `true`; lo demás es 400.
  final bool aceptaPolitica;

  Map<String, Object?> toJson() => _$AceptacionPresencialDtoToJson(this);
}
