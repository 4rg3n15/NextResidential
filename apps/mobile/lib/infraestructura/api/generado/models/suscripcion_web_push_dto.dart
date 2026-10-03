// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'llaves_de_suscripcion_dto.dart';

part 'suscripcion_web_push_dto.g.dart';

@JsonSerializable()
class SuscripcionWebPushDto {
  const SuscripcionWebPushDto({
    required this.endpoint,
    required this.keys,
  });
  
  factory SuscripcionWebPushDto.fromJson(Map<String, Object?> json) => _$SuscripcionWebPushDtoFromJson(json);
  
  final String endpoint;
  final LlavesDeSuscripcionDto keys;

  Map<String, Object?> toJson() => _$SuscripcionWebPushDtoToJson(this);
}
