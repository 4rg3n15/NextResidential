// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'enlace_de_consentimiento_dto.g.dart';

@JsonSerializable()
class EnlaceDeConsentimientoDto {
  const EnlaceDeConsentimientoDto({
    required this.consentimientoId,
    required this.estado,
    required this.token,
    required this.ruta,
    required this.url,
    required this.expiraEn,
  });
  
  factory EnlaceDeConsentimientoDto.fromJson(Map<String, Object?> json) => _$EnlaceDeConsentimientoDtoFromJson(json);
  
  final String consentimientoId;

  /// Estado del consentimiento al emitir el enlace
  final String estado;

  /// Token firmado; vale sólo para este consentimiento y caduca
  final String token;

  /// Ruta en la API: /consentimiento/<token>
  final String ruta;

  /// URL completa si API_URL_PUBLICA está declarada; null si no lo está
  final String? url;

  /// Caducidad del enlace (ISO 8601)
  final String expiraEn;

  Map<String, Object?> toJson() => _$EnlaceDeConsentimientoDtoToJson(this);
}
