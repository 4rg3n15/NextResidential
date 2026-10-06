// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'edicion_de_menor_dto.g.dart';

@JsonSerializable()
class EdicionDeMenorDto {
  const EdicionDeMenorDto({
    required this.nombres,
    required this.apellidos,
    required this.fechaNacimiento,
    required this.parentesco,
  });
  
  factory EdicionDeMenorDto.fromJson(Map<String, Object?> json) => _$EdicionDeMenorDtoFromJson(json);
  
  final String nombres;
  final String apellidos;
  final String fechaNacimiento;
  final String parentesco;

  Map<String, Object?> toJson() => _$EdicionDeMenorDtoToJson(this);
}
