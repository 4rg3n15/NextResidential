// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'patron_de_entrada_dto.dart';

part 'crear_autorizacion_dto.g.dart';

@JsonSerializable()
class CrearAutorizacionDto {
  const CrearAutorizacionDto({
    required this.viviendaId,
    required this.personaId,
    required this.desde,
    required this.hasta,
    this.zonasPermitidas,
    this.maximoAcompanantes,
    this.patron,
    this.placa,
    this.observaciones,
  });
  
  factory CrearAutorizacionDto.fromJson(Map<String, Object?> json) => _$CrearAutorizacionDtoFromJson(json);
  
  final String viviendaId;

  /// Persona que visita.
  final String personaId;
  final DateTime desde;
  final DateTime hasta;
  final List<String>? zonasPermitidas;
  final num? maximoAcompanantes;

  /// Su presencia es lo único que distingue una recurrente de una única (HU-09).
  final PatronDeEntradaDto? patron;
  final String? placa;
  final String? observaciones;

  Map<String, Object?> toJson() => _$CrearAutorizacionDtoToJson(this);
}
