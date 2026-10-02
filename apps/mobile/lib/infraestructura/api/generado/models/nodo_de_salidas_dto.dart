// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'nodo_de_salidas_dto_estado.dart';
import 'nodo_de_salidas_dto_tipo.dart';

part 'nodo_de_salidas_dto.g.dart';

@JsonSerializable()
class NodoDeSalidasDto {
  const NodoDeSalidasDto({
    required this.ruta,
    required this.padre,
    required this.nivel,
    required this.tipo,
    required this.nombre,
    required this.numeroDePuerta,
    required this.estado,
    required this.nota,
  });
  
  factory NodoDeSalidasDto.fromJson(Map<String, Object?> json) => _$NodoDeSalidasDtoFromJson(json);
  
  /// `equipo/propio/puerta-1`
  final String ruta;
  final String? padre;

  /// 1 equipo · 2 módulo · 3 salida
  final num nivel;
  final NodoDeSalidasDtoTipo tipo;
  final String nombre;
  final num? numeroDePuerta;
  final NodoDeSalidasDtoEstado? estado;
  final String? nota;

  Map<String, Object?> toJson() => _$NodoDeSalidasDtoToJson(this);
}
