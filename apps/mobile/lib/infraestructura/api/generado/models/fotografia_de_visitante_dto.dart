// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fotografia_de_visitante_dto_tipo_mime.dart';

part 'fotografia_de_visitante_dto.g.dart';

@JsonSerializable()
class FotografiaDeVisitanteDto {
  const FotografiaDeVisitanteDto({
    required this.tipoMime,
    required this.contenidoBase64,
  });
  
  factory FotografiaDeVisitanteDto.fromJson(Map<String, Object?> json) => _$FotografiaDeVisitanteDtoFromJson(json);
  
  final FotografiaDeVisitanteDtoTipoMime tipoMime;

  /// Imagen JPEG o PNG en base64, máximo 1,5 MiB.
  final String contenidoBase64;

  Map<String, Object?> toJson() => _$FotografiaDeVisitanteDtoToJson(this);
}
