// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'en_atencion_dto.dart';

part 'cola_de_atencion_dto.g.dart';

@JsonSerializable()
class ColaDeAtencionDto {
  const ColaDeAtencionDto({
    required this.cola,
    required this.total,
    required this.criticos,
    required this.esperaMaxima,
  });
  
  factory ColaDeAtencionDto.fromJson(Map<String, Object?> json) => _$ColaDeAtencionDtoFromJson(json);
  
  /// Ordenada por espera DESCENDENTE, con lo crítico delante. No por recencia: una bandeja por recencia hunde al que lleva más tiempo esperando cada vez que llega otro.
  final List<EnAtencionDto> cola;
  final num total;
  final num criticos;
  final num esperaMaxima;

  Map<String, Object?> toJson() => _$ColaDeAtencionDtoToJson(this);
}
