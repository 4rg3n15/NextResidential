// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'url_de_evidencia_dto.g.dart';

@JsonSerializable()
class UrlDeEvidenciaDto {
  const UrlDeEvidenciaDto({
    required this.url,
  });
  
  factory UrlDeEvidenciaDto.fromJson(Map<String, Object?> json) => _$UrlDeEvidenciaDtoFromJson(json);
  
  /// URL firmada de vida corta (120 s) al bucket privado. No se cachea ni se persiste: el enlace acaba en el historial del navegador y ahí sigue siendo válido (RN-21).
  final String url;

  Map<String, Object?> toJson() => _$UrlDeEvidenciaDtoToJson(this);
}
