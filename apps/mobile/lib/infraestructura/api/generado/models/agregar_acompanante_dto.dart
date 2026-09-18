// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'agregar_acompanante_dto.g.dart';

@JsonSerializable()
class AgregarAcompananteDto {
  const AgregarAcompananteDto({
    required this.personaId,
    required this.nombre,
  });
  
  factory AgregarAcompananteDto.fromJson(Map<String, Object?> json) => _$AgregarAcompananteDtoFromJson(json);
  
  /// El acompañante entra por su PROPIA identidad, para que la lista negra lo alcance (D-01).
  final String personaId;
  final String nombre;

  Map<String, Object?> toJson() => _$AgregarAcompananteDtoToJson(this);
}
