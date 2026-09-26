// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'restablecimiento_de_contrasena_dto.g.dart';

@JsonSerializable()
class RestablecimientoDeContrasenaDto {
  const RestablecimientoDeContrasenaDto({
    required this.temporal,
    this.motivo,
  });
  
  factory RestablecimientoDeContrasenaDto.fromJson(Map<String, Object?> json) => _$RestablecimientoDeContrasenaDtoFromJson(json);
  
  /// Contraseña temporal que ESCRIBE quien restablece (S-51). No se devuelve nunca; la cuenta queda obligada a cambiarla en su siguiente ingreso.
  final String temporal;
  final String? motivo;

  Map<String, Object?> toJson() => _$RestablecimientoDeContrasenaDtoToJson(this);
}
