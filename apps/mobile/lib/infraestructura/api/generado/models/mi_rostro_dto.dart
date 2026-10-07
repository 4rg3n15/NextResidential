// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'medidas_de_foto_dto.dart';
import 'mi_rostro_dto_tipo_mime.dart';

part 'mi_rostro_dto.g.dart';

@JsonSerializable()
class MiRostroDto {
  const MiRostroDto({
    required this.contenidoBase64,
    required this.tipoMime,
    required this.medidas,
    required this.versionPolitica,
    required this.aceptaPolitica,
  });
  
  factory MiRostroDto.fromJson(Map<String, Object?> json) => _$MiRostroDtoFromJson(json);
  
  /// La foto frontal, JPEG o PNG, en base64
  final String contenidoBase64;
  final MiRostroDtoTipoMime tipoMime;
  final MedidasDeFotoDto medidas;

  /// La versión de la política que la app mostró
  final String versionPolitica;

  /// Acepta la política: debe ser true
  final bool aceptaPolitica;

  Map<String, Object?> toJson() => _$MiRostroDtoToJson(this);
}
