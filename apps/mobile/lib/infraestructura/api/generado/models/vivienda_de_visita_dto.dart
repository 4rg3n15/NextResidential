// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vivienda_de_visita_dto.g.dart';

@JsonSerializable()
class ViviendaDeVisitaDto {
  const ViviendaDeVisitaDto({
    required this.id,
    required this.nombre,
  });
  
  factory ViviendaDeVisitaDto.fromJson(Map<String, Object?> json) => _$ViviendaDeVisitaDtoFromJson(json);
  
  final String id;
  final String nombre;

  Map<String, Object?> toJson() => _$ViviendaDeVisitaDtoToJson(this);
}
