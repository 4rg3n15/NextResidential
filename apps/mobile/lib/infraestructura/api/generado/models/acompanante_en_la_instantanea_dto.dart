// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'acompanante_en_la_instantanea_dto.g.dart';

@JsonSerializable()
class AcompananteEnLaInstantaneaDto {
  const AcompananteEnLaInstantaneaDto({
    required this.personaId,
    required this.nombre,
  });
  
  factory AcompananteEnLaInstantaneaDto.fromJson(Map<String, Object?> json) => _$AcompananteEnLaInstantaneaDtoFromJson(json);
  
  final String personaId;

  /// Siempre vacío: el motor no lee nombres (minimización)
  final String nombre;

  Map<String, Object?> toJson() => _$AcompananteEnLaInstantaneaDtoToJson(this);
}
