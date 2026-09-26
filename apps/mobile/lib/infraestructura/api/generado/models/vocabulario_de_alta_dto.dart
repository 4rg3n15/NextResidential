// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vocabulario_de_alta_dto.g.dart';

@JsonSerializable()
class VocabularioDeAltaDto {
  const VocabularioDeAltaDto({
    required this.copropiedadNombre,
    required this.tipo,
    required this.etiquetaVivienda,
    required this.etiquetaAgrupacion,
  });
  
  factory VocabularioDeAltaDto.fromJson(Map<String, Object?> json) => _$VocabularioDeAltaDtoFromJson(json);
  
  final String copropiedadNombre;
  final String? tipo;
  final String etiquetaVivienda;
  final String etiquetaAgrupacion;

  Map<String, Object?> toJson() => _$VocabularioDeAltaDtoToJson(this);
}
