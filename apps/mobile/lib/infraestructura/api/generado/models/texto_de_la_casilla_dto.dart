// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'texto_de_la_casilla_dto.g.dart';

@JsonSerializable()
class TextoDeLaCasillaDto {
  const TextoDeLaCasillaDto({
    required this.texto,
    required this.version,
  });
  
  factory TextoDeLaCasillaDto.fromJson(Map<String, Object?> json) => _$TextoDeLaCasillaDtoFromJson(json);
  
  final String texto;
  final String version;

  Map<String, Object?> toJson() => _$TextoDeLaCasillaDtoToJson(this);
}
