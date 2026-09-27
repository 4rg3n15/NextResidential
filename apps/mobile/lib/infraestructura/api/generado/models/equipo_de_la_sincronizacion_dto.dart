// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'equipo_de_la_sincronizacion_dto.g.dart';

@JsonSerializable()
class EquipoDeLaSincronizacionDto {
  const EquipoDeLaSincronizacionDto({
    required this.dispositivoId,
    required this.nombre,
    required this.sincronizada,
    required this.detalle,
  });
  
  factory EquipoDeLaSincronizacionDto.fromJson(Map<String, Object?> json) => _$EquipoDeLaSincronizacionDtoFromJson(json);
  
  final String dispositivoId;
  final String nombre;
  final bool sincronizada;
  final String detalle;

  Map<String, Object?> toJson() => _$EquipoDeLaSincronizacionDtoToJson(this);
}
