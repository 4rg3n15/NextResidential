// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'atestacion_de_equipo_dto.g.dart';

@JsonSerializable()
class AtestacionDeEquipoDto {
  const AtestacionDeEquipoDto({
    required this.id,
    required this.firmware,
    required this.placaEnListaBlanca,
    required this.placaDesconocida,
    required this.evidencia,
    required this.registradaEn,
    required this.registradaPor,
    required this.vigente,
    required this.motivoSinEfecto,
  });
  
  factory AtestacionDeEquipoDto.fromJson(Map<String, Object?> json) => _$AtestacionDeEquipoDtoFromJson(json);
  
  final String id;
  final String firmware;
  final String placaEnListaBlanca;
  final String placaDesconocida;
  final String evidencia;
  final String registradaEn;
  final String registradaPor;
  final bool vigente;

  /// Por qué no vale (p. ej. el firmware cambió). `null` si está vigente.
  final String? motivoSinEfecto;

  Map<String, Object?> toJson() => _$AtestacionDeEquipoDtoToJson(this);
}
