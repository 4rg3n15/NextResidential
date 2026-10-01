// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'punto_de_la_orden_dto.g.dart';

@JsonSerializable()
class PuntoDeLaOrdenDto {
  const PuntoDeLaOrdenDto({
    required this.id,
    required this.nombre,
    required this.numeroDePuerta,
  });
  
  factory PuntoDeLaOrdenDto.fromJson(Map<String, Object?> json) => _$PuntoDeLaOrdenDtoFromJson(json);
  
  final String id;
  final String nombre;
  final num numeroDePuerta;

  Map<String, Object?> toJson() => _$PuntoDeLaOrdenDtoToJson(this);
}
