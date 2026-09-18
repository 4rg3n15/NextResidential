// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conteos_de_alertas_dto.dart';
import 'conteos_de_visitantes_dto.dart';
import 'conteos_del_padron_dto.dart';
import 'ventana_del_dia_dto.dart';

part 'indicadores_dto.g.dart';

@JsonSerializable()
class IndicadoresDto {
  const IndicadoresDto({
    required this.padron,
    required this.visitantes,
    required this.alertas,
    required this.ventana,
  });
  
  factory IndicadoresDto.fromJson(Map<String, Object?> json) => _$IndicadoresDtoFromJson(json);
  
  final ConteosDelPadronDto padron;
  final ConteosDeVisitantesDto visitantes;
  final ConteosDeAlertasDto alertas;
  final VentanaDelDiaDto ventana;

  Map<String, Object?> toJson() => _$IndicadoresDtoToJson(this);
}
