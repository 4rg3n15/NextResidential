// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'responder_consentimiento_dto.g.dart';

@JsonSerializable()
class ResponderConsentimientoDto {
  const ResponderConsentimientoDto({
    required this.acepta,
    this.evidenciaId,
  });
  
  factory ResponderConsentimientoDto.fromJson(Map<String, Object?> json) => _$ResponderConsentimientoDtoFromJson(json);
  
  /// true acepta, false rechaza. Lo responde el TITULAR.
  final bool acepta;

  /// Evidencia de la aceptación (RN-09)
  final String? evidenciaId;

  Map<String, Object?> toJson() => _$ResponderConsentimientoDtoToJson(this);
}
