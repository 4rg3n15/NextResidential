// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'grupo_proyectado_dto.dart';
import 'vivienda_proyectada_dto.dart';

part 'vista_previa_de_generacion_dto.g.dart';

@JsonSerializable()
class VistaPreviaDeGeneracionDto {
  const VistaPreviaDeGeneracionDto({
    required this.total,
    required this.grupos,
    required this.colisiones,
  });
  
  factory VistaPreviaDeGeneracionDto.fromJson(Map<String, Object?> json) => _$VistaPreviaDeGeneracionDtoFromJson(json);
  
  final num total;
  final List<GrupoProyectadoDto> grupos;

  /// Las que ya existen activas. Con una sola, la confirmacion se niega entera: la generacion solo inserta y nunca sustituye nada.
  final List<ViviendaProyectadaDto> colisiones;

  Map<String, Object?> toJson() => _$VistaPreviaDeGeneracionDtoToJson(this);
}
