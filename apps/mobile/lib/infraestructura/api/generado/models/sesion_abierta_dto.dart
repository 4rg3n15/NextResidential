// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sesion_abierta_dto_estado.dart';

part 'sesion_abierta_dto.g.dart';

@JsonSerializable()
class SesionAbiertaDto {
  const SesionAbiertaDto({
    required this.estado,
    required this.iniciadaEn,
    required this.patrullajeDesde,
    required this.origen,
  });
  
  factory SesionAbiertaDto.fromJson(Map<String, Object?> json) => _$SesionAbiertaDtoFromJson(json);
  
  final SesionAbiertaDtoEstado estado;
  final DateTime iniciadaEn;
  final DateTime? patrullajeDesde;

  /// Origen que declaró la consola
  final String? origen;

  Map<String, Object?> toJson() => _$SesionAbiertaDtoToJson(this);
}
