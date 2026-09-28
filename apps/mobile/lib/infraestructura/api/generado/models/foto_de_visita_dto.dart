// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'foto_de_visita_dto_tipo_mime.dart';
import 'medidas_de_foto_dto.dart';

part 'foto_de_visita_dto.g.dart';

@JsonSerializable()
class FotoDeVisitaDto {
  const FotoDeVisitaDto({
    required this.contenidoBase64,
    required this.tipoMime,
    required this.medidas,
  });
  
  factory FotoDeVisitaDto.fromJson(Map<String, Object?> json) => _$FotoDeVisitaDtoFromJson(json);
  
  /// La foto frontal, JPEG o PNG, en base64
  final String contenidoBase64;
  final FotoDeVisitaDtoTipoMime tipoMime;
  final MedidasDeFotoDto medidas;

  Map<String, Object?> toJson() => _$FotoDeVisitaDtoToJson(this);
}
