// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'archivo_de_alerta_dto.g.dart';

@JsonSerializable()
class ArchivoDeAlertaDto {
  const ArchivoDeAlertaDto({
    required this.motivo,
  });
  
  factory ArchivoDeAlertaDto.fromJson(Map<String, Object?> json) => _$ArchivoDeAlertaDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$ArchivoDeAlertaDtoToJson(this);
}
