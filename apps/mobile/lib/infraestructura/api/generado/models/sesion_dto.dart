// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sesion_dto_rol.dart';

part 'sesion_dto.g.dart';

@JsonSerializable()
class SesionDto {
  const SesionDto({
    required this.usuarioId,
    required this.rol,
    required this.copropiedadId,
    required this.copropiedadesAtendidas,
    required this.mfaVerificado,
  });
  
  factory SesionDto.fromJson(Map<String, Object?> json) => _$SesionDtoFromJson(json);
  
  final String usuarioId;

  /// Rol derivado de los claims, no elegido
  final SesionDtoRol rol;

  /// Copropiedad del usuario; null en el operador de central, que atiende varias
  final String? copropiedadId;

  /// Alcance del operador de central, acotado a su turno activo (KPI-35)
  final List<String> copropiedadesAtendidas;

  /// aal2 en el token. Los roles administrativos no operan sin él (RN-20, CA-25): la consola debe llevar al paso de segundo factor mientras sea false.
  final bool mfaVerificado;

  Map<String, Object?> toJson() => _$SesionDtoToJson(this);
}
