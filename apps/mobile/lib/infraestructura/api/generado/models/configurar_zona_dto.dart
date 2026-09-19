// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'configurar_zona_dto_politica_reinicio.dart';
import 'franja_dto.dart';

part 'configurar_zona_dto.g.dart';

@JsonSerializable()
class ConfigurarZonaDto {
  const ConfigurarZonaDto({
    this.nombre,
    this.aforoMaximo,
    this.horario,
    this.politicaReinicio,
    this.normas,
    this.abierta,
  });
  
  factory ConfigurarZonaDto.fromJson(Map<String, Object?> json) => _$ConfigurarZonaDtoFromJson(json);
  
  final String? nombre;

  /// Aforo máximo simultáneo (RN-14)
  final num? aforoMaximo;
  final List<FranjaDto>? horario;
  final ConfigurarZonaDtoPoliticaReinicio? politicaReinicio;
  final List<String>? normas;

  /// Cierre manual del operador, sin presencia física (PB-04)
  final bool? abierta;

  Map<String, Object?> toJson() => _$ConfigurarZonaDtoToJson(this);
}
