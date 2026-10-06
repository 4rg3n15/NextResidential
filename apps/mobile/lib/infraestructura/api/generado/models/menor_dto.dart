// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'menor_dto_tipo_documento.dart';

part 'menor_dto.g.dart';

@JsonSerializable()
class MenorDto {
  const MenorDto({
    required this.nombres,
    required this.apellidos,
    required this.fechaNacimiento,
    required this.parentesco,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.plazaId,
  });
  
  factory MenorDto.fromJson(Map<String, Object?> json) => _$MenorDtoFromJson(json);
  
  final String nombres;
  final String apellidos;
  final String fechaNacimiento;
  final String parentesco;
  final MenorDtoTipoDocumento tipoDocumento;
  final String numeroDocumento;

  /// Una plaza LIBRE de su vivienda
  final String plazaId;

  Map<String, Object?> toJson() => _$MenorDtoToJson(this);
}
