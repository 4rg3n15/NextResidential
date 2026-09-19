// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'orden_ejecutada_dto_accion.dart';
import 'orden_ejecutada_dto_resultado.dart';

part 'orden_ejecutada_dto.g.dart';

@JsonSerializable()
class OrdenEjecutadaDto {
  const OrdenEjecutadaDto({
    required this.id,
    required this.accion,
    required this.motivo,
    required this.operadorId,
    required this.rol,
    required this.dispositivoId,
    required this.momento,
    required this.eventoId,
    required this.resultado,
    required this.detalle,
  });
  
  factory OrdenEjecutadaDto.fromJson(Map<String, Object?> json) => _$OrdenEjecutadaDtoFromJson(json);
  
  final String id;
  final OrdenEjecutadaDtoAccion accion;
  final String motivo;
  final String operadorId;
  final String rol;
  final String dispositivoId;
  final DateTime momento;
  final String? eventoId;

  /// Respuesta del equipo. «aceptada» significa orden aceptada, NO paso franqueado. Nulo en una negación, que no acciona nada.
  final OrdenEjecutadaDtoResultado? resultado;

  /// Lo que contestó el equipo.
  final String? detalle;

  Map<String, Object?> toJson() => _$OrdenEjecutadaDtoToJson(this);
}
