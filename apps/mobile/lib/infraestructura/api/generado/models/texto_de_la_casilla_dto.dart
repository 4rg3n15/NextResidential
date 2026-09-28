// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'texto_de_la_casilla_dto.g.dart';

@JsonSerializable()
class TextoDeLaCasillaDto {
  const TextoDeLaCasillaDto({
    required this.plantilla,
    required this.marcador,
    required this.version,
  });
  
  factory TextoDeLaCasillaDto.fromJson(Map<String, Object?> json) => _$TextoDeLaCasillaDtoFromJson(json);
  
  /// Texto de la casilla con el marcador {visitante}: el cliente lo sustituye por el nombre escrito en el formulario
  final String plantilla;

  /// El marcador que se sustituye: {visitante}
  final String marcador;
  final String version;

  Map<String, Object?> toJson() => _$TextoDeLaCasillaDtoToJson(this);
}
