// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'capturar_rostro_dto_canal.dart';
import 'medidas_dto.dart';

part 'capturar_rostro_dto.g.dart';

@JsonSerializable()
class CapturarRostroDto {
  const CapturarRostroDto({
    required this.titularId,
    required this.medidas,
    required this.vector,
    required this.versionPolitica,
    required this.canal,
    required this.suprimirEn,
    this.autorizacionId,
  });
  
  factory CapturarRostroDto.fromJson(Map<String, Object?> json) => _$CapturarRostroDtoFromJson(json);
  
  /// El TITULAR del dato: el visitante (RN-10)
  final String titularId;
  final String? autorizacionId;
  final MedidasDto medidas;

  /// Vector biométrico en base64. No es la fotografía.
  final String vector;

  /// Versión de la política de tratamiento aceptada
  final String versionPolitica;
  final CapturarRostroDtoCanal canal;

  /// Instante de supresión programada (RN-11)
  final String suprimirEn;

  Map<String, Object?> toJson() => _$CapturarRostroDtoToJson(this);
}
