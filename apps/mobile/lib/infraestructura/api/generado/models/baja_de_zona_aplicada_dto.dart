// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_de_zona_aplicada_dto.g.dart';

@JsonSerializable()
class BajaDeZonaAplicadaDto {
  const BajaDeZonaAplicadaDto({
    required this.desactivada,
  });
  
  factory BajaDeZonaAplicadaDto.fromJson(Map<String, Object?> json) => _$BajaDeZonaAplicadaDtoFromJson(json);
  
  final bool desactivada;

  Map<String, Object?> toJson() => _$BajaDeZonaAplicadaDtoToJson(this);
}
