// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'miembro_de_familia_dto.g.dart';

@JsonSerializable()
class MiembroDeFamiliaDto {
  const MiembroDeFamiliaDto({
    required this.residenteId,
    required this.nombre,
    required this.parentesco,
    required this.esTitular,
    required this.nivelAcceso,
    required this.activo,
  });
  
  factory MiembroDeFamiliaDto.fromJson(Map<String, Object?> json) => _$MiembroDeFamiliaDtoFromJson(json);
  
  final String residenteId;
  final String nombre;
  final String? parentesco;
  final bool esTitular;
  final String? nivelAcceso;

  /// RN-19: el desactivado conserva historial.
  final bool activo;

  Map<String, Object?> toJson() => _$MiembroDeFamiliaDtoToJson(this);
}
