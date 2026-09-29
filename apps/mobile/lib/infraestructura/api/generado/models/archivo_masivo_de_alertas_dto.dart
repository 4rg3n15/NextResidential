// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'archivo_masivo_de_alertas_dto.g.dart';

@JsonSerializable()
class ArchivoMasivoDeAlertasDto {
  const ArchivoMasivoDeAlertasDto({
    required this.motivo,
    required this.ids,
  });
  
  factory ArchivoMasivoDeAlertasDto.fromJson(Map<String, Object?> json) => _$ArchivoMasivoDeAlertasDtoFromJson(json);
  
  final String motivo;
  final List<String> ids;

  Map<String, Object?> toJson() => _$ArchivoMasivoDeAlertasDtoToJson(this);
}
