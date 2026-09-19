// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'autorizar_zona_dto.g.dart';

@JsonSerializable()
class AutorizarZonaDto {
  const AutorizarZonaDto({
    required this.autorizacionId,
  });
  
  factory AutorizarZonaDto.fromJson(Map<String, Object?> json) => _$AutorizarZonaDtoFromJson(json);
  
  final String autorizacionId;

  Map<String, Object?> toJson() => _$AutorizarZonaDtoToJson(this);
}
