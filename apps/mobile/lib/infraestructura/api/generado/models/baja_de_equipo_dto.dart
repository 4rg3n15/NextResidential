// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_de_equipo_dto.g.dart';

@JsonSerializable()
class BajaDeEquipoDto {
  const BajaDeEquipoDto({
    required this.motivo,
  });
  
  factory BajaDeEquipoDto.fromJson(Map<String, Object?> json) => _$BajaDeEquipoDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$BajaDeEquipoDtoToJson(this);
}
