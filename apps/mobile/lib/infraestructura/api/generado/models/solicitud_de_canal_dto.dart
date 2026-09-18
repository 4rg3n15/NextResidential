// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'solicitud_de_canal_dto.g.dart';

@JsonSerializable()
class SolicitudDeCanalDto {
  const SolicitudDeCanalDto({
    required this.dispositivoId,
  });
  
  factory SolicitudDeCanalDto.fromJson(Map<String, Object?> json) => _$SolicitudDeCanalDtoFromJson(json);
  
  final String dispositivoId;

  Map<String, Object?> toJson() => _$SolicitudDeCanalDtoToJson(this);
}
