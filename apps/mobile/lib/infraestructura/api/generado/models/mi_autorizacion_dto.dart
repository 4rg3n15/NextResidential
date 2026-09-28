// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mi_autorizacion_dto_situacion.dart';

part 'mi_autorizacion_dto.g.dart';

@JsonSerializable()
class MiAutorizacionDto {
  const MiAutorizacionDto({
    required this.id,
    required this.visitante,
    required this.tipo,
    required this.desde,
    required this.hasta,
    required this.placa,
    required this.permiteAccesoVehicular,
    required this.estado,
    required this.acompanantes,
    required this.situacion,
    required this.motivoRechazo,
  });
  
  factory MiAutorizacionDto.fromJson(Map<String, Object?> json) => _$MiAutorizacionDtoFromJson(json);
  
  final String id;
  final String visitante;
  final String tipo;
  final DateTime desde;
  final DateTime hasta;
  final String? placa;
  final bool permiteAccesoVehicular;
  final String estado;
  final num acompanantes;

  /// Lo que enseña la tarjeta de la app, con el reloj del servidor: vigente, programada, vencida o rechazada (anulada por portería o superadministración)
  final MiAutorizacionDtoSituacion situacion;

  /// El motivo que escribió quien la rechazó. `null` si no está rechazada
  final String? motivoRechazo;

  Map<String, Object?> toJson() => _$MiAutorizacionDtoToJson(this);
}
