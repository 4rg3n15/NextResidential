// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'franja_de_accesos_dto.dart';

part 'accesos_por_hora_dto.g.dart';

@JsonSerializable()
class AccesosPorHoraDto {
  const AccesosPorHoraDto({
    required this.franjas,
    required this.zonaHoraria,
    required this.desde,
    required this.hasta,
  });
  
  factory AccesosPorHoraDto.fromJson(Map<String, Object?> json) => _$AccesosPorHoraDtoFromJson(json);
  
  /// Siempre 24 franjas, incluidas las de cero: el eje lo fija el servidor
  final List<FranjaDeAccesosDto> franjas;
  final String zonaHoraria;
  final DateTime desde;
  final DateTime hasta;

  Map<String, Object?> toJson() => _$AccesosPorHoraDtoToJson(this);
}
