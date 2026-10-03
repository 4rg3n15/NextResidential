// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'suscripcion_registrada_dto.g.dart';

@JsonSerializable()
class SuscripcionRegistradaDto {
  const SuscripcionRegistradaDto({
    required this.id,
  });
  
  factory SuscripcionRegistradaDto.fromJson(Map<String, Object?> json) => _$SuscripcionRegistradaDtoFromJson(json);
  
  final String id;

  Map<String, Object?> toJson() => _$SuscripcionRegistradaDtoToJson(this);
}
