// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'token_de_notificacion_dto_plataforma.dart';

part 'token_de_notificacion_dto.g.dart';

@JsonSerializable()
class TokenDeNotificacionDto {
  const TokenDeNotificacionDto({
    required this.instalacionId,
    required this.token,
    required this.plataforma,
  });
  
  factory TokenDeNotificacionDto.fromJson(Map<String, Object?> json) => _$TokenDeNotificacionDtoFromJson(json);
  
  /// Identificador estable del aparato
  final String instalacionId;
  final String token;
  final TokenDeNotificacionDtoPlataforma plataforma;

  Map<String, Object?> toJson() => _$TokenDeNotificacionDtoToJson(this);
}
