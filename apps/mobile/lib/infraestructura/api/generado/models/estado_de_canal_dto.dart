// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'estado_de_canal_dto_estado.dart';

part 'estado_de_canal_dto.g.dart';

@JsonSerializable()
class EstadoDeCanalDto {
  const EstadoDeCanalDto({
    required this.dispositivoId,
    required this.estado,
    required this.porDelante,
    required this.titular,
    required this.timeoutSegundos,
  });
  
  factory EstadoDeCanalDto.fromJson(Map<String, Object?> json) => _$EstadoDeCanalDtoFromJson(json);
  
  final String dispositivoId;

  /// El canal de audio del equipo admite UNA conversación a la vez (ADR-01). El segundo operador no se rechaza: se encola.
  final EstadoDeCanalDtoEstado estado;

  /// Cuántos van delante. 0 cuando se tiene la palabra.
  final num porDelante;

  /// Quién tiene la palabra ahora
  final String? titular;

  /// Segundos tras los que el canal se libera solo por inactividad
  final num timeoutSegundos;

  Map<String, Object?> toJson() => _$EstadoDeCanalDtoToJson(this);
}
