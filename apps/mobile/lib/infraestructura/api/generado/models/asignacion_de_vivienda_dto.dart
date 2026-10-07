// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'asignacion_de_vivienda_dto.g.dart';

@JsonSerializable()
class AsignacionDeViviendaDto {
  const AsignacionDeViviendaDto({
    required this.viviendaId,
    required this.motivo,
  });
  
  factory AsignacionDeViviendaDto.fromJson(Map<String, Object?> json) => _$AsignacionDeViviendaDtoFromJson(json);
  
  final String viviendaId;
  final String motivo;

  Map<String, Object?> toJson() => _$AsignacionDeViviendaDtoToJson(this);
}
