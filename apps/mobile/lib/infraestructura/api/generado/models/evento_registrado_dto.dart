// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'evento_registrado_dto_metodo.dart';
import 'evento_registrado_dto_motivo.dart';
import 'evento_registrado_dto_resultado.dart';
import 'evento_registrado_dto_tipo.dart';

part 'evento_registrado_dto.g.dart';

@JsonSerializable()
class EventoRegistradoDto {
  const EventoRegistradoDto({
    required this.id,
    required this.copropiedadId,
    required this.ocurridoEn,
    required this.tipo,
    required this.resultado,
    required this.motivo,
    required this.metodo,
    required this.personaId,
    required this.viviendaId,
    required this.zonaId,
    required this.dispositivoId,
    required this.placaDetectada,
    required this.confianza,
    required this.reglaAplicada,
    required this.versionReglas,
    required this.operadorId,
    required this.motivoManual,
    required this.evidenciaId,
    required this.decididoPorEdge,
  });
  
  factory EventoRegistradoDto.fromJson(Map<String, Object?> json) => _$EventoRegistradoDtoFromJson(json);
  
  final String id;
  final String copropiedadId;
  final DateTime ocurridoEn;
  final EventoRegistradoDtoTipo tipo;
  final EventoRegistradoDtoResultado resultado;

  /// Motivo tipado de la denegación; null cuando el acceso fue permitido. La precedencia del motor (listaNegra > vigencia > patrón > zona) decide cuál se sella.
  final EventoRegistradoDtoMotivo? motivo;
  final EventoRegistradoDtoMetodo metodo;
  final String? personaId;
  final String? viviendaId;
  final String? zonaId;
  final String dispositivoId;
  final String? placaDetectada;
  final num? confianza;

  /// Regla que determinó el resultado
  final String reglaAplicada;

  /// Versión de reglas con la que se decidió; hace auditable la decisión del Edge
  final num versionReglas;
  final String? operadorId;
  final String? motivoManual;
  final String? evidenciaId;

  /// Resuelto localmente por el Edge con caché de reglas (RN-16, CA-21, KPI-31)
  final bool decididoPorEdge;

  Map<String, Object?> toJson() => _$EventoRegistradoDtoToJson(this);
}
