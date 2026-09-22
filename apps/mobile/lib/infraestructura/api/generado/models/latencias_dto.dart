// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fila_de_latencia_dto.dart';

part 'latencias_dto.g.dart';

@JsonSerializable()
class LatenciasDto {
  const LatenciasDto({
    required this.desde,
    required this.ventana,
    required this.porProceso,
    required this.filas,
  });
  
  factory LatenciasDto.fromJson(Map<String, Object?> json) => _$LatenciasDtoFromJson(json);
  
  /// Arranque del proceso que sirve esta respuesta
  final String desde;

  /// Tamaño de la ventana deslizante, en muestras
  final num ventana;

  /// Por proceso, no por despliegue: con varias instancias cada una lleva su ventana (D-29)
  final bool porProceso;
  final List<FilaDeLatenciaDto> filas;

  Map<String, Object?> toJson() => _$LatenciasDtoToJson(this);
}
