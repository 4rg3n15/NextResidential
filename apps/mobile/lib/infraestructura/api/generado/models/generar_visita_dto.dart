// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'foto_de_visita_dto.dart';
import 'generar_visita_dto_tipo_documento.dart';

part 'generar_visita_dto.g.dart';

@JsonSerializable()
class GenerarVisitaDto {
  const GenerarVisitaDto({
    required this.inicio,
    required this.duracionMinutos,
    required this.casillaMarcada,
    required this.nombre,
    required this.tipoDocumento,
    required this.documento,
    required this.viviendaId,
    required this.foto,
    this.placa,
    this.observaciones,
  });
  
  factory GenerarVisitaDto.fromJson(Map<String, Object?> json) => _$GenerarVisitaDtoFromJson(json);
  
  /// Fecha y hora de la visita
  final DateTime inicio;
  final num duracionMinutos;
  final String? placa;
  final String? observaciones;

  /// La casilla «El visitante autorizó el uso de su foto para el ingreso». Obligatoria.
  final bool casillaMarcada;
  final String nombre;
  final GenerarVisitaDtoTipoDocumento tipoDocumento;
  final String documento;
  final String viviendaId;
  final FotoDeVisitaDto foto;

  Map<String, Object?> toJson() => _$GenerarVisitaDtoToJson(this);
}
