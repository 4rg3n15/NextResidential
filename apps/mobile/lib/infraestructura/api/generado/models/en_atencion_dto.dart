// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'en_atencion_dto_urgencia.dart';

part 'en_atencion_dto.g.dart';

@JsonSerializable()
class EnAtencionDto {
  const EnAtencionDto({
    required this.eventoId,
    required this.ocurridoEn,
    required this.motivo,
    required this.resultado,
    required this.dispositivoId,
    required this.viviendaId,
    required this.placaDetectada,
    required this.esperaSegundos,
    required this.urgencia,
    required this.demorado,
  });
  
  factory EnAtencionDto.fromJson(Map<String, Object?> json) => _$EnAtencionDtoFromJson(json);
  
  final String eventoId;
  final DateTime ocurridoEn;
  final String? motivo;
  final String resultado;
  final String dispositivoId;
  final String? viviendaId;
  final String? placaDetectada;

  /// Segundos que lleva esperando. Se CALCULA en cada consulta, no se guarda: una espera guardada envejece mal y la consola pintaría un número que dejó de ser cierto.
  final num esperaSegundos;
  final EnAtencionDtoUrgencia urgencia;

  /// Pasado el umbral de KPI-34
  final bool demorado;

  Map<String, Object?> toJson() => _$EnAtencionDtoToJson(this);
}
