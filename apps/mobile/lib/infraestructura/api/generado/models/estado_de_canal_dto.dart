// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'estado_de_canal_dto_estado.dart';
import 'estado_de_canal_dto_transporte.dart';

part 'estado_de_canal_dto.g.dart';

@JsonSerializable()
class EstadoDeCanalDto {
  const EstadoDeCanalDto({
    required this.dispositivoId,
    required this.estado,
    required this.porDelante,
    required this.titular,
    required this.timeoutSegundos,
    required this.transporte,
    required this.detalleTransporte,
    required this.formatoDeAudio,
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

  /// Por dónde va el audio: «equipo» si el proveedor abrió el canal del aparato; «ninguno» si hay turno pero no transporte (el equipo no declara audio o no está en el registro).
  final EstadoDeCanalDtoTransporte transporte;

  /// Por qué no hay transporte, si no lo hay
  final String? detalleTransporte;

  /// A4 · códec que el equipo anuncia para el audio (p. ej. g711u). Null sin transporte. La consola decodifica lo que el equipo dice.
  final String? formatoDeAudio;

  Map<String, Object?> toJson() => _$EstadoDeCanalDtoToJson(this);
}
