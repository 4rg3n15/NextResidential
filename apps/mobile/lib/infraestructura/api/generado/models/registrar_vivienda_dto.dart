// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'registrar_vivienda_dto.g.dart';

@JsonSerializable()
class RegistrarViviendaDto {
  const RegistrarViviendaDto({
    required this.identificador,
    this.agrupacion,
  });
  
  factory RegistrarViviendaDto.fromJson(Map<String, Object?> json) => _$RegistrarViviendaDtoFromJson(json);
  
  final String identificador;
  final String? agrupacion;

  Map<String, Object?> toJson() => _$RegistrarViviendaDtoToJson(this);
}
