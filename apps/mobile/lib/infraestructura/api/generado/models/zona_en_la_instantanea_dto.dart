// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'franja_en_la_instantanea_dto.dart';
import 'zona_en_la_instantanea_dto_restringida.dart';

part 'zona_en_la_instantanea_dto.g.dart';

@JsonSerializable()
class ZonaEnLaInstantaneaDto {
  const ZonaEnLaInstantaneaDto({
    required this.id,
    required this.restringida,
    required this.abierta,
    required this.aforoMaximo,
    required this.ocupacionActual,
    required this.desplazamientoUtcMinutos,
    required this.franjas,
  });
  
  factory ZonaEnLaInstantaneaDto.fromJson(Map<String, Object?> json) => _$ZonaEnLaInstantaneaDtoFromJson(json);
  
  final String id;
  final ZonaEnLaInstantaneaDtoRestringida restringida;
  final bool abierta;
  final num aforoMaximo;
  final num ocupacionActual;
  final num desplazamientoUtcMinutos;
  final List<FranjaEnLaInstantaneaDto> franjas;

  Map<String, Object?> toJson() => _$ZonaEnLaInstantaneaDtoToJson(this);
}
