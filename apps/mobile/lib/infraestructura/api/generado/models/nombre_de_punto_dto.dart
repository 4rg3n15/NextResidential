// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'nombre_de_punto_dto.g.dart';

@JsonSerializable()
class NombreDePuntoDto {
  const NombreDePuntoDto({
    required this.nombre,
  });
  
  factory NombreDePuntoDto.fromJson(Map<String, Object?> json) => _$NombreDePuntoDtoFromJson(json);
  
  final String nombre;

  Map<String, Object?> toJson() => _$NombreDePuntoDtoToJson(this);
}
