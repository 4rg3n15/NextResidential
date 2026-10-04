// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'orden_de_modo_dto_modo.dart';

part 'orden_de_modo_dto.g.dart';

@JsonSerializable()
class OrdenDeModoDto {
  const OrdenDeModoDto({
    required this.dispositivoId,
    required this.numeroDePuerta,
    required this.modo,
    required this.motivo,
    this.minutos,
  });
  
  factory OrdenDeModoDto.fromJson(Map<String, Object?> json) => _$OrdenDeModoDtoFromJson(json);
  
  final String dispositivoId;
  final num numeroDePuerta;
  final OrdenDeModoDtoModo modo;

  /// Obligatorio (RN-08). Sin motivo la puerta no cambia de modo.
  final String motivo;

  /// Minutos hasta la reversión; sin él, la duración máxima de la copropiedad.
  final num? minutos;

  Map<String, Object?> toJson() => _$OrdenDeModoDtoToJson(this);
}
