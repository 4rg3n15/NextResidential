// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'patron_de_visita_dto.dart';

part 'nueva_visita_dto.g.dart';

@JsonSerializable()
class NuevaVisitaDto {
  const NuevaVisitaDto({
    required this.visitante,
    required this.desde,
    required this.hasta,
    required this.claveDeIdempotencia,
    this.permiteAccesoVehicular = false,
    this.documento,
    this.placa,
    this.acompanantes,
    this.zonasPermitidas,
    this.observaciones,
    this.patron,
  });
  
  factory NuevaVisitaDto.fromJson(Map<String, Object?> json) => _$NuevaVisitaDtoFromJson(json);
  
  final String visitante;

  /// Documento; sin él, RN-06 solo cruza placa
  final String? documento;

  /// Inicio de la vigencia, ISO-8601 con zona
  final String desde;

  /// Fin de la vigencia, EXCLUIDO
  final String hasta;

  /// Placa; se normaliza en la base
  final String? placa;
  final bool permiteAccesoVehicular;

  /// Nombres, no un contador
  final List<String>? acompanantes;
  final List<String>? zonasPermitidas;
  final String? observaciones;
  final PatronDeVisitaDto? patron;
  final String claveDeIdempotencia;

  Map<String, Object?> toJson() => _$NuevaVisitaDtoToJson(this);
}
