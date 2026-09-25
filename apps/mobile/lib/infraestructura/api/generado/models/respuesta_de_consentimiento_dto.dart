// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sincronizacion_total_dto.dart';

part 'respuesta_de_consentimiento_dto.g.dart';

@JsonSerializable()
class RespuestaDeConsentimientoDto {
  const RespuestaDeConsentimientoDto({
    required this.estado,
    required this.propagacion,
  });
  
  factory RespuestaDeConsentimientoDto.fromJson(Map<String, Object?> json) => _$RespuestaDeConsentimientoDtoFromJson(json);
  
  /// Estado resultante del consentimiento
  final String estado;

  /// Si el titular aceptó: el resultado de empujar cada plantilla a todas las terminales. Vacío si rechazó o si no había plantilla pendiente.
  final List<SincronizacionTotalDto> propagacion;

  Map<String, Object?> toJson() => _$RespuestaDeConsentimientoDtoToJson(this);
}
