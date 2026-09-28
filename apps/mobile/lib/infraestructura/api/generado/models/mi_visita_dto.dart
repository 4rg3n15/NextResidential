// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'foto_de_visita_dto.dart';

part 'mi_visita_dto.g.dart';

@JsonSerializable()
class MiVisitaDto {
  const MiVisitaDto({
    required this.inicio,
    required this.duracionMinutos,
    required this.casillaMarcada,
    required this.nombre,
    required this.documento,
    required this.foto,
    required this.claveDeIdempotencia,
    this.placa,
    this.observaciones,
  });
  
  factory MiVisitaDto.fromJson(Map<String, Object?> json) => _$MiVisitaDtoFromJson(json);
  
  /// Fecha y hora de la visita
  final DateTime inicio;
  final num duracionMinutos;
  final String? placa;
  final String? observaciones;

  /// La casilla «El visitante autorizó el uso de su foto para el ingreso». Obligatoria.
  final bool casillaMarcada;
  final String nombre;
  final String documento;
  final FotoDeVisitaDto foto;

  /// La reusa cada reintento sin conexión
  final String claveDeIdempotencia;

  Map<String, Object?> toJson() => _$MiVisitaDtoToJson(this);
}
