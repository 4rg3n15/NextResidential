// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'modo_vigente_dto_modo.dart';
import 'modo_vigente_dto_resultado.dart';

part 'modo_vigente_dto.g.dart';

@JsonSerializable()
class ModoVigenteDto {
  const ModoVigenteDto({
    required this.id,
    required this.dispositivoId,
    required this.numeroDePuerta,
    required this.modo,
    required this.motivo,
    required this.operadorId,
    required this.operadorNombre,
    required this.rol,
    required this.desde,
    required this.revierteEn,
    required this.resultado,
    required this.reversionesFallidas,
  });
  
  factory ModoVigenteDto.fromJson(Map<String, Object?> json) => _$ModoVigenteDtoFromJson(json);
  
  final String id;
  final String dispositivoId;
  final num numeroDePuerta;
  final ModoVigenteDtoModo modo;
  final String motivo;
  final String operadorId;
  final String? operadorNombre;
  final String rol;
  final DateTime desde;
  final DateTime revierteEn;
  final ModoVigenteDtoResultado? resultado;

  /// Reversiones automáticas que no llegaron al equipo
  final num reversionesFallidas;

  Map<String, Object?> toJson() => _$ModoVigenteDtoToJson(this);
}
