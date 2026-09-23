// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'correccion_de_equipo_dto_correccion.dart';

part 'correccion_de_equipo_dto.g.dart';

@JsonSerializable()
class CorreccionDeEquipoDto {
  const CorreccionDeEquipoDto({
    required this.correccion,
    required this.motivo,
  });
  
  factory CorreccionDeEquipoDto.fromJson(Map<String, Object?> json) => _$CorreccionDeEquipoDtoFromJson(json);
  
  final CorreccionDeEquipoDtoCorreccion correccion;

  /// Por qué se corrige. Queda en la auditoría junto a quién y cuándo.
  final String motivo;

  Map<String, Object?> toJson() => _$CorreccionDeEquipoDtoToJson(this);
}
