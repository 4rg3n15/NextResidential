// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'medidas_de_foto_dto.dart';
import 'rostro_de_menor_dto_tipo_mime.dart';

part 'rostro_de_menor_dto.g.dart';

@JsonSerializable()
class RostroDeMenorDto {
  const RostroDeMenorDto({
    required this.contenidoBase64,
    required this.tipoMime,
    required this.medidas,
    required this.versionPolitica,
    required this.aceptaPolitica,
    required this.declaraRepresentacionLegal,
    required this.menorInformadoYDeAcuerdo,
  });
  
  factory RostroDeMenorDto.fromJson(Map<String, Object?> json) => _$RostroDeMenorDtoFromJson(json);
  
  /// La foto frontal, JPEG o PNG, en base64
  final String contenidoBase64;
  final RostroDeMenorDtoTipoMime tipoMime;
  final MedidasDeFotoDto medidas;

  /// La versión de la política que la app mostró
  final String versionPolitica;

  /// Acepta la política: debe ser true
  final bool aceptaPolitica;

  /// Soy su representante legal: debe ser true
  final bool declaraRepresentacionLegal;

  /// El menor fue informado y está de acuerdo: debe ser true
  final bool menorInformadoYDeAcuerdo;

  Map<String, Object?> toJson() => _$RostroDeMenorDtoToJson(this);
}
