// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sesion_de_acceso_dto.g.dart';

@JsonSerializable()
class SesionDeAccesoDto {
  const SesionDeAccesoDto({
    required this.accessToken,
    required this.refreshToken,
    required this.expiraEn,
    required this.debeCambiarContrasena,
  });
  
  factory SesionDeAccesoDto.fromJson(Map<String, Object?> json) => _$SesionDeAccesoDtoFromJson(json);
  
  final String accessToken;
  final String refreshToken;

  /// Segundos Unix
  final num expiraEn;
  final bool debeCambiarContrasena;

  Map<String, Object?> toJson() => _$SesionDeAccesoDtoToJson(this);
}
