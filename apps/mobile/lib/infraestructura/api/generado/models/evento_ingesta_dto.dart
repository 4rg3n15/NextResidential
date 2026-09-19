// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'evento_ingesta_dto_metodo.dart';

part 'evento_ingesta_dto.g.dart';

@JsonSerializable()
class EventoIngestaDto {
  const EventoIngestaDto({
    required this.copropiedadId,
    required this.dispositivoId,
    required this.metodo,
    required this.confianzaCentesimas,
    required this.referenciaExterna,
    this.personaId,
    this.placaLeida,
    this.zonaId,
  });
  
  factory EventoIngestaDto.fromJson(Map<String, Object?> json) => _$EventoIngestaDtoFromJson(json);
  
  final String copropiedadId;
  final String dispositivoId;
  final EventoIngestaDtoMetodo metodo;
  final String? personaId;
  final String? placaLeida;
  final String? zonaId;

  /// Confianza de la lectura, 0..1
  final num confianzaCentesimas;

  /// Identificador del evento en el equipo (RN-17)
  final String referenciaExterna;

  Map<String, Object?> toJson() => _$EventoIngestaDtoToJson(this);
}
