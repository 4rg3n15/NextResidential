// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'autorizacion_dto_estado.dart';
import 'autorizacion_dto_tipo.dart';
import 'patron_de_autorizacion_dto.dart';

part 'autorizacion_dto.g.dart';

@JsonSerializable()
class AutorizacionDto {
  const AutorizacionDto({
    required this.id,
    required this.viviendaId,
    required this.vivienda,
    required this.visitante,
    required this.documento,
    required this.desde,
    required this.hasta,
    required this.tipo,
    required this.estado,
    required this.placa,
    required this.acompanantes,
    required this.patron,
    required this.revocadaEn,
    required this.motivoRevocacion,
    required this.observaciones,
    required this.tieneFotografia,
  });
  
  factory AutorizacionDto.fromJson(Map<String, Object?> json) => _$AutorizacionDtoFromJson(json);
  
  final String id;
  final String viviendaId;
  final String vivienda;
  final String visitante;
  final String documento;
  final DateTime desde;
  final DateTime hasta;
  final AutorizacionDtoTipo tipo;
  final AutorizacionDtoEstado estado;
  final String? placa;
  final List<String> acompanantes;
  final PatronDeAutorizacionDto? patron;
  final DateTime? revocadaEn;
  final String? motivoRevocacion;
  final String? observaciones;
  final bool tieneFotografia;

  Map<String, Object?> toJson() => _$AutorizacionDtoToJson(this);
}
