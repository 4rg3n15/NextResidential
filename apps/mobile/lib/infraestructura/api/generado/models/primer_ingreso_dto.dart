// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'primer_ingreso_dto_tipo_documento.dart';

part 'primer_ingreso_dto.g.dart';

@JsonSerializable()
class PrimerIngresoDto {
  const PrimerIngresoDto({
    required this.nombres,
    required this.apellidos,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.telefono,
    required this.fechaNacimiento,
    this.correo,
  });
  
  factory PrimerIngresoDto.fromJson(Map<String, Object?> json) => _$PrimerIngresoDtoFromJson(json);
  
  final String nombres;
  final String apellidos;
  final PrimerIngresoDtoTipoDocumento tipoDocumento;
  final String numeroDocumento;

  /// Canal de CONTACTO, no de acceso
  final String telefono;
  final String fechaNacimiento;

  /// Contacto NO verificado (S-15W-04)
  final String? correo;

  Map<String, Object?> toJson() => _$PrimerIngresoDtoToJson(this);
}
