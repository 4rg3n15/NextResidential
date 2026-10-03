// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'suscripcion_anulada_dto.g.dart';

@JsonSerializable()
class SuscripcionAnuladaDto {
  const SuscripcionAnuladaDto({
    required this.anulada,
  });
  
  factory SuscripcionAnuladaDto.fromJson(Map<String, Object?> json) => _$SuscripcionAnuladaDtoFromJson(json);
  
  final bool anulada;

  Map<String, Object?> toJson() => _$SuscripcionAnuladaDtoToJson(this);
}
