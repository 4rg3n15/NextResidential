// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'acompanante_en_la_instantanea_dto.dart';
import 'autorizacion_en_la_instantanea_dto_estado.dart';
import 'patron_en_la_instantanea_dto.dart';

part 'autorizacion_en_la_instantanea_dto.g.dart';

@JsonSerializable()
class AutorizacionEnLaInstantaneaDto {
  const AutorizacionEnLaInstantaneaDto({
    required this.id,
    required this.viviendaId,
    required this.personaId,
    required this.desde,
    required this.hasta,
    required this.estado,
    required this.zonasPermitidas,
    required this.acompanantes,
    required this.maximoAcompanantes,
    required this.patron,
    required this.placa,
  });
  
  factory AutorizacionEnLaInstantaneaDto.fromJson(Map<String, Object?> json) => _$AutorizacionEnLaInstantaneaDtoFromJson(json);
  
  /// UUID, o `residente:<vehículo>` para el derecho del residente
  final String id;
  final String viviendaId;
  final String personaId;
  final DateTime desde;
  final DateTime hasta;
  final AutorizacionEnLaInstantaneaDtoEstado estado;
  final List<String> zonasPermitidas;
  final List<AcompananteEnLaInstantaneaDto> acompanantes;
  final num maximoAcompanantes;
  final PatronEnLaInstantaneaDto? patron;
  final String? placa;

  Map<String, Object?> toJson() => _$AutorizacionEnLaInstantaneaDtoToJson(this);
}
