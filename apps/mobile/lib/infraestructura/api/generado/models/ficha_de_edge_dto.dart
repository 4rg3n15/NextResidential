// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ficha_de_edge_dto.g.dart';

@JsonSerializable()
class FichaDeEdgeDto {
  const FichaDeEdgeDto({
    required this.id,
    required this.nombre,
    required this.puente,
    required this.conectado,
    required this.versionDeReglas,
    this.puenteDesde,
    this.conexionDesde,
    this.ultimoLatido,
  });
  
  factory FichaDeEdgeDto.fromJson(Map<String, Object?> json) => _$FichaDeEdgeDtoFromJson(json);
  
  final String id;
  final String nombre;

  /// Los equipos del conjunto se operan por su túnel (ADR-035)
  final bool puente;
  final DateTime? puenteDesde;

  /// A3 · el túnel está abierto ahora
  final bool conectado;

  /// Desde cuándo está conectado, o desde cuándo NO (null: no se ha visto)
  final DateTime? conexionDesde;
  final DateTime? ultimoLatido;
  final num versionDeReglas;

  Map<String, Object?> toJson() => _$FichaDeEdgeDtoToJson(this);
}
