// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_de_suscripcion_dto.g.dart';

@JsonSerializable()
class BajaDeSuscripcionDto {
  const BajaDeSuscripcionDto({
    required this.endpoint,
  });
  
  factory BajaDeSuscripcionDto.fromJson(Map<String, Object?> json) => _$BajaDeSuscripcionDtoFromJson(json);
  
  final String endpoint;

  Map<String, Object?> toJson() => _$BajaDeSuscripcionDtoToJson(this);
}
