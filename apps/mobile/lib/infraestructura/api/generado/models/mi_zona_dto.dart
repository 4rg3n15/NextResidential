// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'franja_dto.dart';

part 'mi_zona_dto.g.dart';

@JsonSerializable()
class MiZonaDto {
  const MiZonaDto({
    required this.id,
    required this.nombre,
    required this.aforoMaximo,
    required this.ocupacionActual,
    required this.abiertaAhora,
    required this.franjasDeHoy,
    required this.requiereAutorizacion,
  });
  
  factory MiZonaDto.fromJson(Map<String, Object?> json) => _$MiZonaDtoFromJson(json);
  
  final String id;
  final String nombre;
  final num aforoMaximo;

  /// Ocupación de ESTE instante. La interfaz lo refleja; el aforo lo garantiza la base.
  final num ocupacionActual;
  final bool abiertaAhora;

  /// Franjas de hoy ya resueltas; una que cruza medianoche llega como dos (S-09).
  final List<FranjaDto> franjasDeHoy;
  final bool requiereAutorizacion;

  Map<String, Object?> toJson() => _$MiZonaDtoToJson(this);
}
