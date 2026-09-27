// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'atestacion_de_equipo_entrada_dto.g.dart';

@JsonSerializable()
class AtestacionDeEquipoEntradaDto {
  const AtestacionDeEquipoEntradaDto({
    required this.placaEnListaBlanca,
    required this.placaDesconocida,
    required this.ningunaAbrio,
    required this.evidencia,
  });
  
  factory AtestacionDeEquipoEntradaDto.fromJson(Map<String, Object?> json) => _$AtestacionDeEquipoEntradaDtoFromJson(json);
  
  /// Una placa que ESTÁ en la lista blanca del equipo
  final String placaEnListaBlanca;

  /// Una placa que NO está en ninguna lista del equipo
  final String placaDesconocida;

  /// Lo que se atesta: ninguna de las dos abrió. Sólo `true`; lo demás es 400.
  final bool ningunaAbrio;

  /// Lo que vio el instalador: hora, carril, qué pasó con cada placa
  final String evidencia;

  Map<String, Object?> toJson() => _$AtestacionDeEquipoEntradaDtoToJson(this);
}
