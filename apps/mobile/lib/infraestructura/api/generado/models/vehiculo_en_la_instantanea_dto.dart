// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'vehiculo_en_la_instantanea_dto.g.dart';

@JsonSerializable()
class VehiculoEnLaInstantaneaDto {
  const VehiculoEnLaInstantaneaDto({
    required this.placa,
    required this.vehiculoId,
    required this.personaId,
    required this.viviendaId,
  });
  
  factory VehiculoEnLaInstantaneaDto.fromJson(Map<String, Object?> json) => _$VehiculoEnLaInstantaneaDtoFromJson(json);
  
  final String placa;
  final String vehiculoId;
  final String personaId;
  final String viviendaId;

  Map<String, Object?> toJson() => _$VehiculoEnLaInstantaneaDtoToJson(this);
}
