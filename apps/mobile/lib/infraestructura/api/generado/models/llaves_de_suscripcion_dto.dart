// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'llaves_de_suscripcion_dto.g.dart';

@JsonSerializable()
class LlavesDeSuscripcionDto {
  const LlavesDeSuscripcionDto({
    required this.p256dh,
    required this.auth,
  });
  
  factory LlavesDeSuscripcionDto.fromJson(Map<String, Object?> json) => _$LlavesDeSuscripcionDtoFromJson(json);
  
  /// Llave pública ECDH P-256 del navegador, base64url (65 bytes)
  final String p256dh;

  /// Secreto de autenticación del navegador, base64url (16 bytes)
  final String auth;

  Map<String, Object?> toJson() => _$LlavesDeSuscripcionDtoToJson(this);
}
