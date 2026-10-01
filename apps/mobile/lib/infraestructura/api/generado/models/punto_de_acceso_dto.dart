// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'punto_de_acceso_dto_origen.dart';

part 'punto_de_acceso_dto.g.dart';

@JsonSerializable()
class PuntoDeAccesoDto {
  const PuntoDeAccesoDto({
    required this.id,
    required this.dispositivoId,
    required this.nombre,
    required this.numeroDePuerta,
    required this.modulo,
    required this.rutaEnElEquipo,
    required this.origen,
    required this.descubiertoEn,
  });
  
  factory PuntoDeAccesoDto.fromJson(Map<String, Object?> json) => _$PuntoDeAccesoDtoFromJson(json);
  
  final String id;
  final String dispositivoId;
  final String nombre;
  final num numeroDePuerta;
  final String? modulo;
  final String? rutaEnElEquipo;
  final PuntoDeAccesoDtoOrigen origen;
  final DateTime? descubiertoEn;

  Map<String, Object?> toJson() => _$PuntoDeAccesoDtoToJson(this);
}
