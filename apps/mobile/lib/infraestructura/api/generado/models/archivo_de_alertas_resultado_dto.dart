// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'archivo_de_alertas_resultado_dto.g.dart';

@JsonSerializable()
class ArchivoDeAlertasResultadoDto {
  const ArchivoDeAlertasResultadoDto({
    required this.archivadas,
    required this.omitidas,
  });
  
  factory ArchivoDeAlertasResultadoDto.fromJson(Map<String, Object?> json) => _$ArchivoDeAlertasResultadoDtoFromJson(json);
  
  final num archivadas;

  /// Pedidas y no archivadas: ajenas o ya archivadas
  final num omitidas;

  Map<String, Object?> toJson() => _$ArchivoDeAlertasResultadoDtoToJson(this);
}
