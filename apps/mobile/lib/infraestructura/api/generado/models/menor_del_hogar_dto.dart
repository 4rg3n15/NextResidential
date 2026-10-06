// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'menor_del_hogar_dto.g.dart';

@JsonSerializable()
class MenorDelHogarDto {
  const MenorDelHogarDto({
    required this.residenteId,
    required this.nombres,
    required this.apellidos,
    required this.nombreCompleto,
    required this.fechaNacimiento,
    required this.edad,
    required this.tipoDocumento,
    required this.documento,
    required this.parentesco,
    required this.plazaId,
    required this.plazaNumero,
    required this.tieneRostro,
  });
  
  factory MenorDelHogarDto.fromJson(Map<String, Object?> json) => _$MenorDelHogarDtoFromJson(json);
  
  final String residenteId;
  final String? nombres;
  final String? apellidos;
  final String nombreCompleto;
  final String? fechaNacimiento;
  final num? edad;
  final String tipoDocumento;

  /// Enmascarado: ••••5678
  final String documento;
  final String? parentesco;
  final String? plazaId;
  final num? plazaNumero;
  final bool tieneRostro;

  Map<String, Object?> toJson() => _$MenorDelHogarDtoToJson(this);
}
