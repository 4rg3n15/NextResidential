// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'punto_de_acceso_dto.dart';

part 'puntos_de_acceso_dto.g.dart';

@JsonSerializable()
class PuntosDeAccesoDto {
  const PuntosDeAccesoDto({
    required this.puntos,
  });
  
  factory PuntosDeAccesoDto.fromJson(Map<String, Object?> json) => _$PuntosDeAccesoDtoFromJson(json);
  
  final List<PuntoDeAccesoDto> puntos;

  Map<String, Object?> toJson() => _$PuntosDeAccesoDtoToJson(this);
}
