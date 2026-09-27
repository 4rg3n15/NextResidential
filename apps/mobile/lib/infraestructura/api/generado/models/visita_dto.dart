// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'visita_dto_estado.dart';

part 'visita_dto.g.dart';

@JsonSerializable()
class VisitaDto {
  const VisitaDto({
    required this.autorizacionId,
    required this.visitante,
    required this.documento,
    required this.viviendaId,
    required this.vivienda,
    required this.desde,
    required this.hasta,
    required this.estado,
    required this.placa,
    required this.generadaPor,
    required this.generadaEn,
    required this.anuladaEn,
    required this.motivoAnulacion,
    required this.tieneFoto,
    required this.casillaDeclaradaPor,
    required this.casillaEn,
    required this.plantillaId,
    required this.equiposSincronizados,
    required this.equiposFallidos,
  });
  
  factory VisitaDto.fromJson(Map<String, Object?> json) => _$VisitaDtoFromJson(json);
  
  final String autorizacionId;
  final String visitante;
  final String documento;
  final String viviendaId;
  final String vivienda;
  final DateTime desde;
  final DateTime hasta;
  final VisitaDtoEstado estado;
  final String? placa;
  final String? generadaPor;
  final DateTime generadaEn;
  final DateTime? anuladaEn;
  final String? motivoAnulacion;
  final bool tieneFoto;
  final String? casillaDeclaradaPor;
  final DateTime? casillaEn;
  final String? plantillaId;
  final num equiposSincronizados;
  final num equiposFallidos;

  Map<String, Object?> toJson() => _$VisitaDtoToJson(this);
}
