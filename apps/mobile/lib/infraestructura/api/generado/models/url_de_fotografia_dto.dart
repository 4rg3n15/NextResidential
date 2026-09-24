// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'url_de_fotografia_dto.g.dart';

@JsonSerializable()
class UrlDeFotografiaDto {
  const UrlDeFotografiaDto({
    required this.url,
    required this.expiraEnSegundos,
  });
  
  factory UrlDeFotografiaDto.fromJson(Map<String, Object?> json) => _$UrlDeFotografiaDtoFromJson(json);
  
  final String url;
  final num expiraEnSegundos;

  Map<String, Object?> toJson() => _$UrlDeFotografiaDtoToJson(this);
}
